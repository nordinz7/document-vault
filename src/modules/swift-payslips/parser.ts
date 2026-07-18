import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Payslip, PayslipHeader, PayslipLineItem } from "./schema.ts";

/** A reconstructed line of text: label plus the numeric/text value trailing it. */
interface Line {
  label: string;
  value: string;
}

/** Items on the same visual row can round to y-coordinates a pixel or two apart. */
const Y_TOLERANCE = 2;

/**
 * Extract the PDF's text as ordered visual lines. Text items are grouped by
 * their y-coordinate (top to bottom), sorted left-to-right; the leftmost item
 * is the label and everything to its right is joined into the value.
 */
export async function extractLines(
  data: Uint8Array,
  password?: string,
): Promise<Line[]> {
  const pdf = await getDocument({ data, password }).promise;
  const rows: { y: number; x: number; str: string }[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const item of content.items) {
      // Skip marked-content markers (no `str`/`transform`); keep real text items.
      if (!("str" in item) || !item.str.trim()) continue;
      // transform = [a, b, c, d, e, f] where e=x, f=y in PDF user space.
      rows.push({ x: item.transform[4], y: item.transform[5], str: item.str });
    }
  }

  // Group into lines, tolerating small y jitter within a row.
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

/** Parse a printed amount like "-1,234.50" or "7,800.00" into a number. */
function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  const value = Number(cleaned);
  if (!Number.isFinite(value) || cleaned === "" || cleaned === "-") {
    throw new Error(`Unable to parse amount from ${JSON.stringify(raw)}`);
  }
  return value;
}

// Section-header / boundary labels used to switch parsing state.
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

/** Turn the reconstructed lines into a structured {@link Payslip}. */
export function parseLines(lines: Line[]): Payslip {
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
    // Header fields can appear before the payroll sections, so match them first.
    const headerKey = HEADER_LABELS[label];
    if (headerKey) {
      // IC/PASSPORT is printed with a trailing "/" separating the passport half.
      header[headerKey] = value.replace(/\/\s*$/, "").trim();
      continue;
    }

    // Section transitions.
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

    // Skip column headers and free-standing section titles that carry no value.
    if (!value || value === "RATES AMOUNT" || label.includes("PAYROLL DETAIL")) {
      continue;
    }

    const item: PayslipLineItem = { label, amount: parseAmount(value) };
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

/** Parse a (possibly password-protected) payslip PDF into a {@link Payslip}. */
export async function parsePayslip(
  data: Uint8Array,
  password?: string,
): Promise<Payslip> {
  return parseLines(await extractLines(data, password));
}
