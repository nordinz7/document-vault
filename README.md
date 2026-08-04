# document-vault

Ingests Swift Haulage payslip PDFs, parses them into structured records, and
stores them in a local SQLite database.

The same logic is exposed over two surfaces, both calling the identical service
layer in-process against the same database:

| Surface | Transport | Start with |
| --- | --- | --- |
| **HTTP API** | `Bun.serve` on `http://localhost:3000` | `bun run dev` |
| **MCP server** | JSON-RPC over stdio | `bun run mcp` |

The MCP server is not an HTTP client — **the HTTP server does not need to be
running** for MCP tools to work, and vice versa.

## Setup

Runtime is [Bun](https://bun.com) (not Node).

```bash
bun install
```

The database file (`mydb.sqlite`) and its schema are created automatically on
first run — migrations apply at startup, so there is no separate migrate step.

## HTTP API

```bash
bun run dev        # hot reload
bun run index.ts   # run once
```

| Route | Description |
| --- | --- |
| `GET /` | Health check |
| `GET /docs` | Interactive API reference (Scalar) |
| `GET /openapi.yaml` | The OpenAPI 3.1 spec |
| `GET /payslips` | List payslips, most recent first |
| `GET /payslips/:id` | Fetch one payslip |
| `POST /payslips` | Upload one or more payslip PDFs |

`GET /payslips` accepts optional `periodKey` (`YYYYMM`, e.g. `202606`),
`employeeNo`, and `type` (`salary` \| `bonus`) query parameters, combined with
AND.

`POST /payslips` takes a repeated `file` multipart field plus an optional
`password`. One file returns `201` with the record; multiple files return `207`
with a per-file results array so one bad PDF doesn't fail the batch.

```bash
curl -F file=@june.pdf -F password=secret http://localhost:3000/payslips
curl "http://localhost:3000/payslips?periodKey=202606&type=salary"
```

Full request/response schemas live in [openapi.yaml](openapi.yaml) — browse them
at `/docs` with the server running.

## MCP server

Exposes the vault to MCP clients (Claude Code, Claude Desktop, or any other) as
three tools.

| Tool | Arguments | Returns |
| --- | --- | --- |
| `list_payslips` | `periodKey?` (int, `YYYYMM`), `employeeNo?` (string), `type?` (`salary` \| `bonus`) | Matching records, most recent first |
| `get_payslip` | `id` (positive int) | One record, or an error if not found |
| `import_payslip` | `filePath` (absolute path to a PDF), `password?` | The created or pre-existing record |

`import_payslip` reads a PDF **from the local filesystem** by absolute path —
unlike the HTTP route, there is no file upload. Results are returned as
pretty-printed JSON text using the same shape as the HTTP API.

### Registering it

With Claude Code, from the project root:

```bash
claude mcp add document-vault -- bun run "$PWD/src/mcp/server.ts"
```

Or add it to a client config (e.g. Claude Desktop's
`claude_desktop_config.json`) using an absolute path:

```json
{
  "mcpServers": {
    "document-vault": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/document-vault/src/mcp/server.ts"]
    }
  }
}
```

No `cwd` or `DB_PATH` is required: the database file is anchored to the project
root, so it resolves the same way whatever working directory the client launches
the server in. Set `DB_PATH` only if you want to point at a different database.

### stdio constraint

Over stdio, stdout carries the JSON-RPC protocol. Anything written to stdout by
the server corrupts the stream, so **all logging goes to stderr**
(`console.error`) — keep it that way when editing
[src/mcp/server.ts](src/mcp/server.ts).

## Data shape

Field names are snake_case and mirror the database columns.

```jsonc
{
  "id": 1,
  "employee_id": 1,
  "type": "salary",              // derived: period-ending run paying BASIC PAY
  "period": "END-JUNE-2026",     // as printed on the payslip
  "period_key": 202606,          // sortable YYYYMM
  "earnings": [{ "label": "BASIC PAY", "amount": 5000 }],
  "deductions": [{ "label": "EPF", "amount": -660 }],  // negative, as printed
  "employer_contributions": [{ "label": "EPF", "amount": 780 }],
  "year_to_date": [{ "label": "GROSS", "amount": 36000 }],
  "gross_pay_cents": 6000.55,    // Ringgit, despite the name — see below
  "nett_pay_cents": 5340.55,
  "hash": "9f2c1a...",           // SHA-256 of the raw PDF bytes
  "path": "june.pdf",
  "created_at": "2026-08-03T16:43:49.000Z",
  "updated_at": "2026-08-03T16:43:49.000Z"
}
```

Money is **stored** as integer cents (so `SUM()` doesn't drift) but converted to
Ringgit at the repository boundary — so `gross_pay_cents` and `nett_pay_cents`
carry Ringgit on the wire, and the `_cents` suffix is a misnomer.

Importing is idempotent two ways: by SHA-256 of the raw PDF bytes (identical
bytes return the stored record without re-parsing) and by
`UNIQUE(employee_id, period)`. Either way you get the existing record back
rather than a duplicate or an error.

## Testing

```bash
bun test
bun test src/modules/swift-payslips/parser.test.ts   # one file
bun test -t "parses deductions"                      # by name
```

Tests need no secrets — the parser tests run off an anonymised fixture. **Never
commit real payslip data**; see
[src/modules/swift-payslips/fixtures/README.md](src/modules/swift-payslips/fixtures/README.md).

Any test that touches the database must set `DB_PATH` (to `":memory:"` or a
scratch file) before importing anything that pulls in the connection module —
it's a module-level singleton, so an unset `DB_PATH` writes to the dev database.

See [CLAUDE.md](CLAUDE.md) for architecture and layering rules.
