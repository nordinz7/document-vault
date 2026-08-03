import { describe, expect, test } from "bun:test";
import { derivePayslipType, derivePeriodKey, toCents, toRinggit } from "./helper.ts";
import type { PayslipLineItem } from "./types.ts";

const items = (...labels: string[]): PayslipLineItem[] =>
  labels.map((label) => ({ label, amount: 1 }));

describe("toCents / toRinggit", () => {
  test("round-trips Ringgit through cents", () => {
    for (const amount of [0, 1, 1234.56, 9999999.99]) {
      expect(toRinggit(toCents(amount))).toBe(amount);
    }
  });

  test("keeps deductions negative", () => {
    expect(toCents(-123.45)).toBe(-12345);
    expect(toRinggit(-12345)).toBe(-123.45);
  });

  test("rounds float representation error to whole cents", () => {
    // 19.99 * 100 is 1998.9999999999998 in IEEE-754; truncating would lose a cent.
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(8.29)).toBe(829);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  test("is only exact for 2-decimal input, which is all a payslip prints", () => {
    // A 3-decimal halfway value rounds down, because 1.005 * 100 is
    // 100.49999999999999, not 100.5. Amounts come off the PDF at 2 decimals,
    // so this case cannot arise in practice — pinned so a change is deliberate.
    expect(toCents(1.005)).toBe(100);
  });

  test("sums exactly in cents where Ringgit floats would drift", () => {
    const parts = [0.1, 0.2, 0.3];
    const cents = parts.map(toCents).reduce((a, b) => a + b, 0);
    expect(cents).toBe(60);
    expect(toRinggit(cents)).toBe(0.6);
    // The reason money is stored as cents at all:
    expect(parts.reduce((a, b) => a + b, 0)).not.toBe(0.6);
  });
});

describe("derivePeriodKey", () => {
  test("derives a sortable YYYYMM key from a period label", () => {
    expect(derivePeriodKey("END-JUNE-2026")).toBe(202606);
    expect(derivePeriodKey("END-JANUARY-2026")).toBe(202601);
    expect(derivePeriodKey("END-DECEMBER-2025")).toBe(202512);
  });

  test("sorts chronologically as a number", () => {
    const periods = ["END-JANUARY-2026", "END-DECEMBER-2025", "END-JUNE-2026"];
    expect(periods.map(derivePeriodKey).sort((a, b) => a - b)).toEqual([
      202512, 202601, 202606,
    ]);
  });

  test("accepts spaces, mixed case, and any field order", () => {
    expect(derivePeriodKey("end june 2026")).toBe(202606);
    expect(derivePeriodKey("2026-JUNE")).toBe(202606);
    expect(derivePeriodKey("BONUS - MAY - 2026")).toBe(202605);
  });

  test("returns 0 when the month or year is unrecognised", () => {
    expect(derivePeriodKey("END-JUN-2026")).toBe(0); // abbreviated month
    expect(derivePeriodKey("END-JUNE-26")).toBe(0); // 2-digit year
    expect(derivePeriodKey("END-JUNE")).toBe(0);
    expect(derivePeriodKey("")).toBe(0);
  });
});

describe("derivePayslipType", () => {
  test("is salary for an END period paying basic pay", () => {
    expect(derivePayslipType("END-JUNE-2026", items("BASIC PAY"))).toBe("salary");
    expect(derivePayslipType("end-june-2026", items("BASIC PAY", "OVERTIME"))).toBe(
      "salary",
    );
  });

  test("is bonus when the period is not period-ending", () => {
    expect(derivePayslipType("BONUS-JUNE-2026", items("BASIC PAY"))).toBe("bonus");
  });

  test("is bonus when an END period pays no basic pay", () => {
    expect(derivePayslipType("END-JUNE-2026", items("BONUS", "OVERTIME"))).toBe("bonus");
    expect(derivePayslipType("END-JUNE-2026", [])).toBe("bonus");
  });

  test("matches BASIC PAY as a substring of a longer label", () => {
    expect(derivePayslipType("END-JUNE-2026", items("BASIC PAY ARREARS"))).toBe("salary");
  });
});
