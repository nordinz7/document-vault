import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type {
  TextItem,
  TextMarkedContent,
} from "pdfjs-dist/types/src/display/api";
import type { ParsedPayslip, PayslipHeader, PayslipLineItem } from "./types.ts";

/** One entry of `getTextContent().items` — a text run, or a marked-content
 *  marker (no `str`, skipped). */
export type TextContentItem = TextItem | TextMarkedContent;

interface Line {
  label: string;
  value: string;
}

const Y_TOLERANCE = 2;

/** Groups raw `getTextContent()` items into visual lines: leftmost item is the
 *  label, the rest joined is the value. Pure — tested against a JSON fixture of
 *  real `getTextContent()` output. */
export function linesFromItems(items: readonly TextContentItem[]): Line[] {
  const rows: { y: number; x: number; str: string }[] = [];

  for (const item of items) {
    if (!("str" in item) || !item.str?.trim()) continue;
    rows.push({ x: item.transform[4]!, y: item.transform[5]!, str: item.str });
  }

  rows.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  let current: { y: number; x: number; str: string }[] = [];

  const flush = () => {
    if (current.length === 0) return;
    current.sort((a, b) => a.x - b.x);
    const label = current[0]!.str.trim();
    const value = current
      .slice(1)
      .map((c) => c.str.trim())
      .join(" ")
      .trim();
    lines.push({ label, value });
    current = [];
  };

  for (const row of rows) {
    if (current.length > 0 && Math.abs(current[0]!.y - row.y) > Y_TOLERANCE) {
      flush();
    }
    current.push(row);
  }
  flush();
  return lines;
}

export async function extractLines(
  data: Uint8Array,
  password?: string,
): Promise<Line[]> {
  const pdf = await getDocument({ data, password }).promise;
  const items: TextContentItem[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    items.push(...content.items);
  }

  return linesFromItems(items);
}

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  const value = Number(cleaned);
  if (!Number.isFinite(value) || cleaned === "" || cleaned === "-") {
    throw new Error(`Unable to parse amount from ${JSON.stringify(raw)}`);
  }
  return value;
}

const SECTION = {
  earnings: "EARNINGS",
  grossPay: "GROSS PAY",
  deductions: "DEDUCTIONS",
  nettPay: "NETT PAY",
  ytd: "YEAR-TO-DATE PAYROLL DETAIL",
} as const;

const HEADER_LABELS: Record<string, keyof PayslipHeader> = {
  "COMPANY:": "company",
  "PERIOD:": "period",
  "EMPL NO.:": "employeeNo",
  "NAME:": "name",
  "COSTCENTER:": "costCenter",
  "IC/PASSPORT:": "icPassport",
  "EPF NO.:": "epfNo",
  "TAX NO.:": "taxNo",
};

export function parseLines(lines: Line[]): ParsedPayslip {
  const header: Partial<PayslipHeader> = {};
  const earnings: PayslipLineItem[] = [];
  const deductions: PayslipLineItem[] = [];
  const employerContributions: PayslipLineItem[] = [];
  const yearToDate: PayslipLineItem[] = [];
  let grossPay: number | undefined;
  let nettPay: number | undefined;

  type Section = "header" | "earnings" | "deductions" | "ytd";
  let section: Section = "header";

  for (const { label, value } of lines) {
    const headerKey = HEADER_LABELS[label];
    if (headerKey) {
      header[headerKey] = value.replace(/\/\s*$/, "").trim();
      continue;
    }

    if (label === SECTION.earnings) {
      section = "earnings";
      continue;
    }
    if (label === SECTION.deductions) {
      section = "deductions";
      continue;
    }
    if (label === SECTION.ytd || value === SECTION.ytd) {
      section = "ytd";
      continue;
    }
    if (label === SECTION.grossPay) {
      grossPay = parseAmount(value);
      continue;
    }
    if (label === SECTION.nettPay) {
      nettPay = parseAmount(value);
      continue;
    }

    if (!value || value === "RATES AMOUNT" || label.includes("PAYROLL DETAIL")) {
      continue;
    }

    const item: PayslipLineItem = { label, amount: parseAmount(label.startsWith('NPL DAYS') ? value.split(' ')[value.split(' ').length-1]||'' :value) };
    if (label.startsWith("YTD")) {
      yearToDate.push(item);
    } else if (label.startsWith("Employer")) {
      employerContributions.push(item);
    } else if (section === "earnings") {
      earnings.push(item);
    } else if (section === "deductions") {
      deductions.push(item);
    } else if (section === "ytd") {
      yearToDate.push(item);
    }
  }

  const missing = (Object.values(HEADER_LABELS) as (keyof PayslipHeader)[]).filter(
    (k) => header[k] === undefined,
  );
  if (missing.length > 0) {
    throw new Error(`Payslip header missing fields: ${missing.join(", ")}`);
  }
  if (grossPay === undefined) throw new Error("Payslip missing GROSS PAY");
  if (nettPay === undefined) throw new Error("Payslip missing NETT PAY");

  return {
    header: header as PayslipHeader,
    earnings,
    grossPay,
    deductions,
    nettPay,
    employerContributions,
    yearToDate,
  };
}

export async function parsePayslip(
  data: Uint8Array,
  password?: string,
): Promise<ParsedPayslip> {
  return parseLines(await extractLines(data, password));
}
