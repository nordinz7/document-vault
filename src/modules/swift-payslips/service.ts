import db from "../../infra/db/index.ts";
import { parsePayslip } from "./parser.ts";
import * as repo from "./repository.ts";
import type { PayslipRecord } from "./schema.ts";

/** Business logic for payslips. No HTTP, no SQL — orchestration only. */

export function listPayslips(filter?: repo.PayslipFilter): PayslipRecord[] {
  return repo.findPayslips(filter);
}

export function getPayslip(id: number): PayslipRecord | null {
  return repo.findPayslipById(id);
}

/**
 * Import a payslip PDF: parse it, upsert its employee, and store the record.
 * Idempotent by content hash — importing the same bytes twice returns the
 * already-stored record without re-parsing.
 */
export async function importPayslip(
  pdf: Uint8Array,
  path: string,
  password?: string,
): Promise<PayslipRecord> {
  const hash = new Bun.CryptoHasher("sha256").update(pdf).digest("hex");

  const existing = repo.findPayslipByHash(hash);
  if (existing) return existing;

  const payslip = await parsePayslip(pdf, password);

  // Employee upsert + record insert must succeed or fail together.
  return db.transaction(() => {
    const employeeId = repo.upsertEmployee(payslip.header);
    return repo.insertPayslip(employeeId, payslip, hash, path);
  })();
}
