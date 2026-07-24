import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { migrate } from "../infra/db/migrate.ts";
import * as service from "../modules/swift-payslips/service.ts";

// This is a presentation layer, a sibling to controller.ts: it translates MCP
// tool calls into service calls and shapes the results. It touches no SQL and
// runs in-process, so the HTTP server does not need to be running.
//
// IMPORTANT: over stdio, stdout carries the JSON-RPC protocol. Never write to
// stdout here — logging goes to stderr (console.error) only.

// Ensure the schema exists when the MCP server is started standalone. This runs
// before the transport is connected, so its (rare, first-run-only) stdout output
// cannot corrupt the protocol stream.
migrate();

const server = new McpServer({
  name: "document-vault",
  version: "1.0.0",
});

// A tool result is a JSON payload rendered as pretty text so the model can read it.
const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

const failure = (message: string) => ({
  isError: true,
  content: [{ type: "text" as const, text: message }],
});

server.registerTool(
  "list_payslips",
  {
    title: "List payslips",
    description:
      "List stored payslip records, most recent first. Optionally filter by pay period, employee number, and/or payslip type. Each record includes a derived `type` ('salary' or 'bonus') and a sortable `periodKey` (YYYYMM, e.g. 202606).",
    inputSchema: {
      periodKey: z
        .number()
        .int()
        .optional()
        .describe("Sortable pay-period key (YYYYMM) to filter by, e.g. 202606 for June 2026."),
      employeeNo: z
        .string()
        .optional()
        .describe("Employee number to filter by."),
      type: z
        .enum(["salary", "bonus"])
        .optional()
        .describe("Payslip type to filter by: 'salary' for a period-ending run paying basic pay, else 'bonus'."),
    },
  },
  async ({ periodKey, employeeNo, type }) => {
    try {
      return json(service.listPayslips({ periodKey, employeeNo, type }));
    } catch (err) {
      console.error("list_payslips failed:", err);
      return failure("Failed to list payslips.");
    }
  },
);

server.registerTool(
  "get_payslip",
  {
    title: "Get payslip",
    description: "Fetch a single payslip record by its numeric id.",
    inputSchema: {
      id: z.number().int().positive().describe("The payslip record id."),
    },
  },
  async ({ id }) => {
    try {
      const payslip = service.getPayslip(id);
      return payslip ? json(payslip) : failure(`Payslip ${id} not found.`);
    } catch (err) {
      console.error(`get_payslip(${id}) failed:`, err);
      return failure("Failed to fetch payslip.");
    }
  },
);

server.registerTool(
  "import_payslip",
  {
    title: "Import payslip",
    description:
      "Parse a Swift Haulage payslip PDF from a local file path and store it. Import is idempotent: re-importing identical bytes, or the same employee+period, returns the existing record.",
    inputSchema: {
      filePath: z
        .string()
        .describe("Absolute path to the payslip PDF file on the local filesystem."),
      password: z
        .string()
        .optional()
        .describe("Password for the PDF, if it is encrypted."),
    },
  },
  async ({ filePath, password }) => {
    try {
      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        return failure(`File not found: ${filePath}`);
      }
      const pdf = new Uint8Array(await file.arrayBuffer());
      const record = await service.importPayslip(pdf, filePath, password);
      return json(record);
    } catch (err) {
      console.error(`import_payslip(${filePath}) failed:`, err);
      const message = err instanceof Error ? err.message : "Could not process PDF.";
      return failure(message);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Document Vault MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting MCP server:", err);
  process.exit(1);
});
