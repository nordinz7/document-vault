export interface PayslipHeader {
  company: string;
  period: string;
  employeeNo: string;
  name: string;
  costCenter: string;
  icPassport: string;
  epfNo: string;
  taxNo: string;
}

export interface PayslipLineItem {
  label: string;
  amount: number;
}

export interface ParsedPayslip {
  header: PayslipHeader;
  earnings: PayslipLineItem[];
  grossPay: number;
  deductions: PayslipLineItem[];
  nettPay: number;
  employerContributions: PayslipLineItem[];
  yearToDate: PayslipLineItem[];
}

export type PayslipType = "salary" | "bonus";

//------------------------------DB Models------------------------------
export interface Employee {
  id: number;
  employee_number: string;
  name: string;
  cost_center: string | null;
  ic_passport: string | null;
  epf_number: string | null;
  tax_number: string | null;
  company: string;
  created_at: string;
  updated_at: string;
}
export interface Payslip {
  id: number;
  employee_id: number;
  period: string;
  earnings: string; // JSON: PayslipLineItem[]
  deductions: string; // JSON: PayslipLineItem[]
  employer_contributions: string; // JSON: PayslipLineItem[]
  year_to_date: string; // JSON: PayslipLineItem[]
  gross_pay_cents: number; // money as integer cents
  nett_pay_cents: number;
  hash: string; // SHA-256 of the source PDF
  path: string;
  period_key: number; // sortable YYYYMM key derived from `period`, e.g. 202606, 202505
  type: PayslipType; // "salary" for an END-period run paying BASIC PAY, else "bonus"

  created_at: string;
  updated_at: string;
}

/** Domain payslip — Ringgit money, `Date`s, and derived fields; the mapped
 *  shape returned by the repository and surfaced by the service/controller. */
export type PayslipRecord = Payslip & {
  earnings: PayslipLineItem[];
  deductions: PayslipLineItem[];
  employerContributions: PayslipLineItem[];
  yearToDate: PayslipLineItem[];
  createdAt: Date;
  updatedAt: Date;
}