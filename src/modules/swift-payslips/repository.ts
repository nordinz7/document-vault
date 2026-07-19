import db from "../../infra/db/index.ts";
import type {
  Payslip,
  PayslipHeader,
  PayslipLineItem,
  PayslipRecord,
} from "./schema.ts";

const toCents = (ringgit: number): number => Math.round(ringgit * 100);
const toRinggit = (cents: number): number => cents / 100;

interface PayslipRow {
  id: number;
  employee_id: number;
  period: string;
  earnings: string;
  deductions: string;
  employer_contributions: string;
  year_to_date: string;
  gross_pay_cents: number;
  nett_pay_cents: number;
  hash: string;
  path: string;
  created_at: string;
  updated_at: string;
}

function mapRow(row: PayslipRow): PayslipRecord {
  return {
    id: row.id,
    employeeId: row.employee_id,
    period: row.period,
    earnings: JSON.parse(row.earnings) as PayslipLineItem[],
    deductions: JSON.parse(row.deductions) as PayslipLineItem[],
    employerContributions: JSON.parse(row.employer_contributions) as PayslipLineItem[],
    yearToDate: JSON.parse(row.year_to_date) as PayslipLineItem[],
    grossPay: toRinggit(row.gross_pay_cents),
    nettPay: toRinggit(row.nett_pay_cents),
    hash: row.hash,
    path: row.path,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function upsertEmployee(h: PayslipHeader): number {
  const row = db
    .query(
      `INSERT INTO employee
         (employee_number, name, cost_center, ic_passport, epf_number, tax_number, company)
       VALUES ($employeeNo, $name, $costCenter, $icPassport, $epfNo, $taxNo, $company)
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
      employeeNo: h.employeeNo,
      name: h.name,
      costCenter: h.costCenter,
      icPassport: h.icPassport,
      epfNo: h.epfNo,
      taxNo: h.taxNo,
      company: h.company,
    }) as { id: number };
  return row.id;
}

export function insertPayslip(
  employeeId: number,
  payslip: Payslip,
  hash: string,
  path: string,
): PayslipRecord {
  const row = db
    .query(
      `INSERT INTO payslip_record
         (employee_id, period, earnings, deductions, employer_contributions,
          year_to_date, gross_pay_cents, nett_pay_cents, hash, path)
       VALUES ($employeeId, $period, $earnings, $deductions, $employerContributions,
               $yearToDate, $grossPayCents, $nettPayCents, $hash, $path)
       ON CONFLICT(employee_id, period) DO NOTHING
       RETURNING *`,
    )
    .get({
      employeeId,
      period: payslip.header.period,
      earnings: JSON.stringify(payslip.earnings),
      deductions: JSON.stringify(payslip.deductions),
      employerContributions: JSON.stringify(payslip.employerContributions),
      yearToDate: JSON.stringify(payslip.yearToDate),
      grossPayCents: toCents(payslip.grossPay),
      nettPayCents: toCents(payslip.nettPay),
      hash,
      path,
    }) as PayslipRow | null;

  return row ? mapRow(row) : findByEmployeeAndPeriod(employeeId, payslip.header.period)!;
}

export function findPayslipByHash(hash: string): PayslipRecord | null {
  const row = db
    .query(`SELECT * FROM payslip_record WHERE hash = $hash`)
    .get({ hash }) as PayslipRow | null;
  return row ? mapRow(row) : null;
}

export function findByEmployeeAndPeriod(
  employeeId: number,
  period: string,
): PayslipRecord | null {
  const row = db
    .query(`SELECT * FROM payslip_record WHERE employee_id = $employeeId AND period = $period`)
    .get({ employeeId, period }) as PayslipRow | null;
  return row ? mapRow(row) : null;
}

export function findPayslipById(id: number): PayslipRecord | null {
  const row = db
    .query(`SELECT * FROM payslip_record WHERE id = $id`)
    .get({ id }) as PayslipRow | null;
  return row ? mapRow(row) : null;
}

export interface PayslipFilter {
  period?: string;
  employeeNo?: string;
}

export function findPayslips(filter: PayslipFilter = {}): PayslipRecord[] {
  const clauses: string[] = [];
  const params: Record<string, string> = {};
  if (filter.period) {
    clauses.push("pr.period = $period");
    params.period = filter.period;
  }
  if (filter.employeeNo) {
    clauses.push("e.employee_number = $employeeNo");
    params.employeeNo = filter.employeeNo;
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .query(
      `SELECT pr.* FROM payslip_record pr
       JOIN employee e ON e.id = pr.employee_id
       ${where}
       ORDER BY pr.created_at DESC`,
    )
    .all(params) as PayslipRow[];
  return rows.map(mapRow);
}
