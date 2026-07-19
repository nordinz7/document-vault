/**
 * Structured representation of a Swift Haulage payslip PDF.
 * All monetary values are numbers in Ringgit; deductions are kept negative
 * exactly as printed on the payslip.
 */

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

export interface Payslip {
  header: PayslipHeader;
  earnings: PayslipLineItem[];
  grossPay: number;
  deductions: PayslipLineItem[];
  nettPay: number;
  employerContributions: PayslipLineItem[];
  yearToDate: PayslipLineItem[];
}

// db schema
export interface Employee {
  id: number;
  employeeNo: string;
  name: string;
  costCenter: string;
  icPassport: string;
  epfNo: string;
  taxNo: string;
  company: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PayslipRecord {
  id: number;
  employeeId: number; // foreign key to Employee
  period: string;
  earnings: PayslipLineItem[];
  grossPay: number;
  deductions: PayslipLineItem[];
  nettPay: number;
  employerContributions: PayslipLineItem[];
  yearToDate: PayslipLineItem[];
  hash: string; // hash of the payslip PDF for integrity verification
  path: string; // path to the payslip PDF file
  createdAt: Date;
  updatedAt: Date;
}

// Store money as integer cents, not floats. Your parser produces Number from "1,234.50" — float drift will bite you on any SUM(). Multiply by 100 at the repository boundary. (This is the one change I'd also push back into how amounts flow out of parser.ts.)
// UNIQUE(employee_no, period) makes re-importing the same PDF safe (INSERT ... ON CONFLICT).