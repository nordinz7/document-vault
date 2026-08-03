import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { linesFromItems, parseLines, type TextContentItem } from "./parser.ts";

// `content.json` is verbatim `page.getTextContent()` output from a real payslip
// with every identity and money value replaced by a fake (see
// fixtures/README.md), so these run everywhere — no PDF, no password.

const CONTENT_PATH = join(import.meta.dir, "fixtures", "content.json");
const content = (await Bun.file(CONTENT_PATH).json()) as {
  items: TextContentItem[];
};
const fromContent = () => parseLines(linesFromItems(content.items));

describe("linesFromItems", () => {
  test("groups text items into label/value lines by y-coordinate", () => {
    const lines = linesFromItems(content.items);
    expect(lines).toContainEqual({
      label: "EMPL NO.:",
      value: "PK001",
    });
    // GROSS PAY's amount sits 0.72pt below its label — within Y_TOLERANCE.
    expect(lines).toContainEqual({ label: "GROSS PAY", value: "6,420.00" });
  });

  test("drops whitespace-only and empty text items", () => {
    for (const line of linesFromItems(content.items)) {
      expect(line.label).not.toBe("");
    }
  });

  test("orders lines top-to-bottom regardless of item order", () => {
    const labels = linesFromItems(content.items).map((l) => l.label);
    expect(labels.indexOf("EARNINGS")).toBeLessThan(labels.indexOf("GROSS PAY"));
    expect(labels.indexOf("GROSS PAY")).toBeLessThan(
      labels.indexOf("DEDUCTIONS"),
    );
    expect(labels.indexOf("DEDUCTIONS")).toBeLessThan(labels.indexOf("NETT PAY"));
  });
});

describe("parseLines (content.json fixture)", () => {
  test("parses the header and strips the trailing IC slash", () => {
    expect(fromContent().header).toEqual({
      company: "SAMPLE HAULAGE BERHAD (000000A)",
      period: "END-MARCH-2026",
      employeeNo: "PK001",
      name: "TEST USER BIN SAMPLE",
      costCenter: "SAMPLE COSTCENTER",
      icPassport: "990101-14-5678",
      epfNo: "10203040",
      taxNo: "IG10203040500",
    });
  });

  test("parses earnings, gross and nett pay", () => {
    const payslip = fromContent();
    expect(payslip.earnings).toEqual([{ label: "BASIC PAY", amount: 6420 }]);
    expect(payslip.grossPay).toBe(6420);
    expect(payslip.nettPay).toBe(5361.85);
  });

  test("parses deductions as negative amounts, in printed order", () => {
    expect(fromContent().deductions).toEqual([
      { label: "EMPLOYEE EPF (KWSP)", amount: -706.2 },
      { label: "EMPLOYEE SOCSO (PERKESO)", amount: -24.75 },
      { label: "EMPLOYEE EIS", amount: -9.9 },
      { label: "INCOME TAX PCB", amount: -187.3 },
      { label: "ZAKAT PENDAPATAN", amount: -125 },
      { label: "DEDUCTION SPORTS & RECREATION FUND", amount: -5 },
    ]);
  });

  test("gross plus deductions reconciles to nett pay", () => {
    const payslip = fromContent();
    const total =
      payslip.grossPay +
      payslip.deductions.reduce((sum, d) => sum + d.amount, 0);
    expect(total).toBeCloseTo(payslip.nettPay, 2);
  });

  test("splits employer contributions out of the deductions section", () => {
    expect(fromContent().employerContributions).toEqual([
      { label: "Employer EPF", amount: 834.6 },
      { label: "Employer SOCSO", amount: 86.65 },
      { label: "Employer EIS", amount: 9.9 },
    ]);
  });

  test("parses year-to-date figures", () => {
    const payslip = fromContent();
    expect(payslip.yearToDate).toEqual([
      { label: "YTD BASIC", amount: 19260 },
      { label: "YTD GROSS", amount: 19344.75 },
      { label: "YTD EMPLOYEE EPF", amount: 2118.6 },
      { label: "YTD EMPLOYER EPF", amount: 2503.8 },
      { label: "YTD EMPLOYEE SOCSO", amount: 74.25 },
      { label: "YTD EMPLOYER SOCSO", amount: 259.95 },
      { label: "YTD EMPLOYEE EIS", amount: 29.7 },
      { label: "YTD EMPLOYER EIS", amount: 29.7 },
      { label: "YTD INCOME TAX PCB", amount: 561.9 },
    ]);
  });

  test("keeps section headers and column captions out of the line items", () => {
    const payslip = fromContent();
    const labels = [
      ...payslip.earnings,
      ...payslip.deductions,
      ...payslip.employerContributions,
      ...payslip.yearToDate,
    ].map((i) => i.label);
    for (const noise of [
      "EARNINGS",
      "DEDUCTIONS",
      "CURRENT MONTH PAYROLL DETAIL",
      "YEAR-TO-DATE PAYROLL DETAIL",
    ]) {
      expect(labels).not.toContain(noise);
    }
  });

  test("throws when a required header field is missing", () => {
    const withoutName = content.items.filter(
      (item) => !("str" in item) || item.str !== "NAME:",
    );
    expect(() => parseLines(linesFromItems(withoutName))).toThrow(
      /header missing fields: name/,
    );
  });

  test("throws when NETT PAY is missing", () => {
    const withoutNett = content.items.filter(
      (item) => !("str" in item) || item.str !== "NETT PAY",
    );
    expect(() => parseLines(linesFromItems(withoutNett))).toThrow(
      "Payslip missing NETT PAY",
    );
  });
});
