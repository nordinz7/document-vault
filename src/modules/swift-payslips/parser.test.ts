import { expect, test } from "bun:test";
import { join } from "node:path";
import { parsePayslip } from "./parser.ts";

const PDF_PATH = join(import.meta.dir, "PAYSLIP.pdf");
const PASSWORD = "065717";

async function load() {
  const buf = await Bun.file(PDF_PATH).arrayBuffer();
  return parsePayslip(new Uint8Array(buf), PASSWORD);
}

test("parses the payslip header", async () => {
  const payslip = await load();
  expect(payslip.header).toEqual({
    company: "SWIFT HAULAGE BERHAD (533234V)",
    period: "END-JUNE-2026",
    employeeNo: "PK911",
    name: "NORDIN BIN ZAHARI",
    costCenter: "GROUP SSO",
    icPassport: "971104-04-2311",
    epfNo: "233911232",
    taxNo: "IG2134565633423",
  });
});

test("parses earnings, gross and nett pay", async () => {
  const payslip = await load();
  expect(payslip.earnings).toEqual([{ label: "BASIC PAY", amount: 50000 }]);
  expect(payslip.grossPay).toBe(44000);
  expect(payslip.nettPay).toBe(4502.2);
});

test("parses deductions as negative amounts", async () => {
  const payslip = await load();
  expect(payslip.deductions).toEqual([
    { label: "EMPLOYEE EPF (KWSP)", amount: -11000 },
    { label: "EMPLOYEE SOCSO (PERKESO)", amount: -29.75 },
    { label: "EMPLOYEE SKBBK", amount: -44.65 },
    { label: "EMPLOYEE EIS", amount: -11.9 },
    { label: "INCOME TAX PCB", amount: -500.5 },
    { label: "ZAKAT PENDAPATAN", amount: -150 },
    { label: "DEDUCTION SPORTS & RECREATION FUND", amount: -10 },
  ]);
});

test("gross plus deductions reconciles to nett pay", async () => {
  const payslip = await load();
  const total =
    payslip.grossPay +
    payslip.deductions.reduce((sum, d) => sum + d.amount, 0);
  expect(total).toBeCloseTo(payslip.nettPay, 2);
});

test("parses employer contributions", async () => {
  const payslip = await load();
  expect(payslip.employerContributions).toEqual([
    { label: "Employer EPF", amount: 100 },
    { label: "Employer SOCSO", amount: 104.15 },
    { label: "Employer EIS", amount: 11.9 },
  ]);
});

test("parses year-to-date figures", async () => {
  const payslip = await load();
  const ytd = Object.fromEntries(
    payslip.yearToDate.map((i) => [i.label, i.amount]),
  );
  expect(ytd["YTD GROSS"]).toBe(84950.54);
  expect(ytd["YTD INCOME TAX PCB"]).toBe(3439.05);
  expect(payslip.yearToDate).toHaveLength(9);
});
