import db from "../../infra/db/index.ts";
import {
  derivePayslipType,
  derivePeriodKey,
  toCents,
  toRinggit,
} from "./helper.ts";
import type {
  Employee,
  ParsedPayslip,
  Payslip,
  PayslipHeader,
  PayslipLineItem,
  PayslipRecord,
  PayslipType,
} from "./types.ts";

function mapRow(row: PayslipRecord): Payslip {
  return {
    ...row,

    earnings: JSON.parse(row.earnings || "[]") as PayslipLineItem[],
    deductions: JSON.parse(row.deductions || "[]") as PayslipLineItem[],
    employer_contributions: JSON.parse(row.employer_contributions || "[]") as PayslipLineItem[],
    year_to_date: JSON.parse(row.year_to_date || "[]") as PayslipLineItem[],

    gross_pay_cents: toRinggit(row.gross_pay_cents),
    nett_pay_cents: toRinggit(row.nett_pay_cents),
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  };
}

export function upsertEmployee(h: PayslipHeader): Employee {
  const row = db.query(
      `INSERT INTO employee
         (employee_number, name, cost_center, ic_passport, epf_number, tax_number, company)
       VALUES ($employee_number, $name, $cost_center, $ic_passport, $epf_number, $tax_number, $company)
       ON CONFLICT(employee_number) DO UPDATE SET
         name        = excluded.name,
         cost_center = excluded.cost_center,
         ic_passport = excluded.ic_passport,
         epf_number  = excluded.epf_number,
         tax_number  = excluded.tax_number,
         company     = excluded.company,
         updated_at  = CURRENT_TIMESTAMP
       RETURNING id`,
    )
    .get({
      employee_number: h.employeeNo,
      name: h.name,
      cost_center: h.costCenter,
      ic_passport: h.icPassport,
      epf_number: h.epfNo,
      tax_number: h.taxNo,
      company: h.company,
    })

  return row as Employee;
}

export function insertPayslip(
  employeeId: number,
  payslip: ParsedPayslip,
  hash: string,
  path: string,
): Payslip {
  const values = {
      employee_id: employeeId,
      period: payslip.header.period,
      period_key: derivePeriodKey(payslip.header.period),
      type: derivePayslipType(payslip.header.period, payslip.earnings),
      earnings: JSON.stringify(payslip.earnings),
      deductions: JSON.stringify(payslip.deductions),
      employer_contributions: JSON.stringify(payslip.employerContributions),
      year_to_date: JSON.stringify(payslip.yearToDate),
      gross_pay_cents: toCents(payslip.grossPay),
      nett_pay_cents: toCents(payslip.nettPay),
      hash,
      path,
    }
  const row = db
    .query(
      `INSERT INTO payslip_record
         (employee_id, period, period_key, type, earnings, deductions,
          employer_contributions, year_to_date, gross_pay_cents, nett_pay_cents,
          hash, path)
       VALUES ($employee_id, $period, $period_key, $type, $earnings, $deductions,
               $employer_contributions, $year_to_date, $gross_pay_cents, $nett_pay_cents,
               $hash, $path)
       ON CONFLICT(employee_id, period) DO NOTHING
       RETURNING *`,
    )
    .get(values) as PayslipRecord | null;

  return row ? mapRow(row) : findByEmployeeAndPeriod(employeeId, payslip.header.period)!;
}

export function findPayslipByHash(hash: string): Payslip | null {
  const row = db
    .query(`SELECT * FROM payslip_record WHERE hash = $hash`)
    .get({ hash }) as PayslipRecord | null;
  return row ? mapRow(row) : null;
}

export function findByEmployeeAndPeriod(
  employeeId: number,
  period: string,
): Payslip | null {
  const row = db
    .query(`SELECT * FROM payslip_record WHERE employee_id = $employee_id AND period = $period`)
    .get({ employee_id: employeeId, period }) as PayslipRecord | null;
  return row ? mapRow(row) : null;
}

export function findPayslipById(id: number): Payslip | null {
  const row = db
    .query(`SELECT * FROM payslip_record WHERE id = $id`)
    .get({ id }) as PayslipRecord | null;
  return row ? mapRow(row) : null;
}

export interface PayslipFilter {
  periodKey?: number;
  employeeNo?: string;
  type?: PayslipType;
}

export function findPayslips(filter: PayslipFilter = {}): Payslip[] {
  const clauses: string[] = [];
  const params: Record<string, string | number> = {};
  if (filter.employeeNo) {
    clauses.push("e.employee_number = $employee_number");
    params.employee_number = filter.employeeNo;
  }
  if (filter.periodKey !== undefined) {
    clauses.push("pr.period_key = $period_key");
    params.period_key = filter.periodKey;
  }
  if (filter.type) {
    clauses.push("pr.type = $type");
    params.type = filter.type;
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .query(
      `SELECT pr.* FROM payslip_record pr
       JOIN employee e ON e.id = pr.employee_id
       ${where}
       ORDER BY pr.created_at DESC`,
    )
    .all(params) as PayslipRecord[];
  return rows.map(mapRow);
}
