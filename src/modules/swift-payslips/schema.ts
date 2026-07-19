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
  employeeId: number;
  period: string;
  earnings: PayslipLineItem[];
  grossPay: number;
  deductions: PayslipLineItem[];
  nettPay: number;
  employerContributions: PayslipLineItem[];
  yearToDate: PayslipLineItem[];
  hash: string;
  path: string;
  createdAt: Date;
  updatedAt: Date;
}