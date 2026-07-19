import * as service from "./service.ts";

/** JSON error body — a stable shape for programmatic (e.g. MCP) callers. */
const error = (message: string, status: number): Response =>
  Response.json({ error: message }, { status });

/**
 * GET /payslips — list payslips, optionally filtered.
 * Query params: `period` (e.g. END-JUNE-2026), `employeeNo` (e.g. PK911).
 */
export const list = (req: Bun.BunRequest<"/payslips">): Response => {
  try {
    const url = new URL(req.url);
    const payslips = service.listPayslips({
      period: url.searchParams.get("period") ?? undefined,
      employeeNo: url.searchParams.get("employeeNo") ?? undefined,
    });
    return Response.json(payslips);
  } catch (err) {
    console.error("GET /payslips failed:", err);
    return error("Internal Server Error", 500);
  }
};

/** GET /payslips/:id — fetch a single payslip by id. */
export const getOne = (req: Bun.BunRequest<"/payslips/:id">): Response => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return error("Invalid payslip id", 400);
  }
  try {
    const payslip = service.getPayslip(id);
    return payslip ? Response.json(payslip) : error("Payslip not found", 404);
  } catch (err) {
    console.error(`GET /payslips/${id} failed:`, err);
    return error("Internal Server Error", 500);
  }
};

/**
 * POST /payslips — upload a payslip PDF (multipart/form-data).
 * Fields: `file` (the PDF), optional `password` for encrypted PDFs.
 */
export const upload = async (req: Bun.BunRequest<"/payslips">): Promise<Response> => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return error("Expected multipart/form-data body", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return error("Missing 'file' field", 400);
  }
  const password = form.get("password");

  try {
    const pdf = new Uint8Array(await file.arrayBuffer());
    const record = await service.importPayslip(
      pdf,
      file.name,
      typeof password === "string" && password ? password : undefined,
    );
    return Response.json(record, { status: 201 });
  } catch (err) {
    // A PDF we can't parse/decrypt is a client problem, not a server fault.
    console.error("POST /payslips failed:", err);
    const message = err instanceof Error ? err.message : "Could not process PDF";
    return error(message, 422);
  }
};
