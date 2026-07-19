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
 * POST /payslips — upload one or more payslip PDFs (multipart/form-data).
 * Fields: `file` (the PDF; repeat the field to upload several at once),
 * optional `password` for encrypted PDFs (applied to every file).
 *
 * A single file returns the created record (201). Multiple files return a
 * per-file results array (207 Multi-Status) so one bad PDF doesn't fail the
 * whole batch; the array preserves the order the files were sent in.
 */
export const upload = async (req: Bun.BunRequest<"/payslips">): Promise<Response> => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return error("Expected multipart/form-data body", 400);
  }

  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return error("Missing 'file' field", 400);
  }
  const passwordField = form.get("password");
  const password =
    typeof passwordField === "string" && passwordField ? passwordField : undefined;

  const importOne = async (file: File) => {
    const pdf = new Uint8Array(await file.arrayBuffer());
    return service.importPayslip(pdf, file.name, password);
  };

  // Backward-compatible fast path: one file behaves exactly as before.
  if (files.length === 1) {
    try {
      const record = await importOne(files[0]!);
      return Response.json(record, { status: 201 });
    } catch (err) {
      // A PDF we can't parse/decrypt is a client problem, not a server fault.
      console.error("POST /payslips failed:", err);
      const message = err instanceof Error ? err.message : "Could not process PDF";
      return error(message, 422);
    }
  }

  const results = await Promise.all(
    files.map(async (file) => {
      try {
        return { filename: file.name, status: 201, record: await importOne(file) };
      } catch (err) {
        console.error(`POST /payslips failed for ${file.name}:`, err);
        const message = err instanceof Error ? err.message : "Could not process PDF";
        return { filename: file.name, status: 422, error: message };
      }
    }),
  );
  return Response.json(results, { status: 207 });
};
