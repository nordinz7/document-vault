import type { PayslipLineItem, PayslipType } from "./types.ts";

/**
 * Money is stored as integer cents to avoid float drift on SUM().
 * These conversions happen only at the repository boundary.
 */
export const toCents = (ringgit: number): number => Math.round(ringgit * 100);

export const toRinggit = (cents: number): number => cents / 100;

const MONTHS: Record<string, number> = {
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6,
  JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
};

/**
 * Derive a sortable YYYYMM key from a period label like "END-JUNE-2026".
 * Returns 0 when a month and year can't both be recognised.
 */
export function derivePeriodKey(period: string): number {
  const parts = period.toUpperCase().split(/[-\s]+/).map((p) => p.trim());
  const year = parts.find((p) => /^\d{4}$/.test(p));
  const month = parts.map((p) => MONTHS[p]).find((m) => m !== undefined);
  if (!year || month === undefined) return 0;
  return Number(year) * 100 + month;
}

/**
 * A salary run is period-ending ("END-…") and pays BASIC PAY;
 * everything else is treated as a bonus.
 */
export function derivePayslipType(
  period: string,
  earnings: PayslipLineItem[],
): PayslipType {
  const isEndPeriod = period.trim().toUpperCase().startsWith("END");
  const hasBasicPay = earnings.some((e) =>
    e.label.toUpperCase().includes("BASIC PAY"),
  );
  return isEndPeriod && hasBasicPay ? "salary" : "bonus";
}
