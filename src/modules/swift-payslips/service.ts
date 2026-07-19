import db from "../../infra/db/index.ts";
import { parsePayslip } from "./parser.ts";
import * as repo from "./repository.ts";
import type { PayslipRecord } from "./schema.ts";

export function listPayslips(filter?: repo.PayslipFilter): PayslipRecord[] {
  return repo.findPayslips(filter);
}

export function getPayslip(id: number): PayslipRecord | null {
  return repo.findPayslipById(id);
}

export async function importPayslip(
  pdf: Uint8Array,
  path: string,
  password?: string,
): Promise<PayslipRecord> {
  const hash = new Bun.CryptoHasher("sha256").update(pdf).digest("hex");

  const existing = repo.findPayslipByHash(hash);
  if (existing) return existing;

  const payslip = await parsePayslip(pdf, password);

  return db.transaction(() => {
    const employeeId = repo.upsertEmployee(payslip.header);
    return repo.insertPayslip(employeeId, payslip, hash, path);
  })();
}
