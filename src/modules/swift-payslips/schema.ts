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
