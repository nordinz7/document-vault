# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Runtime is [Bun](https://bun.com) (not Node) — use `bun`, never `npm`/`node`.

- `bun install` — install dependencies
- `bun run dev` — run the HTTP server with hot reload (`bun run --hot index.ts`)
- `bun run index.ts` — run the HTTP server once
- `bun run mcp` — run the MCP server on stdio (`bun run src/mcp/server.ts`)
- `bun test` — run all tests
- `bun test src/modules/swift-payslips/parser.test.ts` — run one test file
- `bun test -t "parses deductions"` — run tests matching a name

`migrate()` runs automatically at startup of both servers ([index.ts](index.ts), [src/mcp/server.ts](src/mcp/server.ts)); there is no separate migration command.

## Architecture

A Bun service that ingests Swift Haulage payslip PDFs, parses them into structured records, and stores them in a local SQLite database.

**Two presentation surfaces, one service layer.** The HTTP API and the MCP server are siblings: both call `service.ts` in-process against the same database, and neither depends on the other running. Business logic belongs in the service so both surfaces get it; don't add logic to one presentation layer alone.

**Entry points**

- [index.ts](index.ts) — HTTP. Defines all routes inline via `Bun.serve({ routes })` (requires Bun ≥ 1.2.3) and wires them to controller functions. There is no router framework. Serves the API docs too: [src/modules/docs/controller.ts](src/modules/docs/controller.ts) exposes `/openapi.yaml` (read once at import) and `/docs` (a Scalar page rendering it).
- [src/mcp/server.ts](src/mcp/server.ts) — MCP over stdio, via `@modelcontextprotocol/sdk`. Registers three tools (`list_payslips`, `get_payslip`, `import_payslip`) with `zod` input schemas and returns results as pretty-printed JSON text. **stdout carries the JSON-RPC protocol — never write to it; log with `console.error` only.** `import_payslip` reads a PDF from an absolute local path rather than accepting an upload; that path is what lands in the record's `path` column.

**Layered module** — [src/modules/swift-payslips/](src/modules/swift-payslips/) is split by responsibility, and the layering is strict; keep concerns in their layer:

- `controller.ts` — HTTP only. Parses requests, shapes responses/status codes, catches errors. Knows nothing about SQL.
- `service.ts` — orchestration/business logic. No HTTP, no SQL. Owns the import flow and transaction boundaries.
- `repository.ts` — the **only** layer that touches SQL and column names.
- `parser.ts` — PDF → `ParsedPayslip`, independent of DB and HTTP.
- `types.ts` — shared types. `PayslipRecord` is the raw SQLite row (integer cents, line items as JSON text) and is repository-internal; `Payslip` is the domain shape (Ringgit, parsed arrays, `Date`s) that the service, controller, and MCP server surface. Both are snake_case, mirroring the columns. `mapRow` is the only crossing point. Don't mix them up — the names read as if reversed.
- `helper.ts` — pure, dependency-free functions shared across layers: money conversion (`toCents`/`toRinggit`) and the derivations `derivePeriodKey`/`derivePayslipType`.

**Infrastructure** — [src/infra/db/index.ts](src/infra/db/index.ts) is connection-only (WAL mode, `foreign_keys = ON`) and deliberately does **not** create tables — this avoids an import cycle with the schema. [src/infra/db/migrate.ts](src/infra/db/migrate.ts) applies numbered `*.sql` files from `migrations/` in filename order, each in a transaction, recording applied names in `_migrations`. Add a new migration as `NNN_name.sql`; never edit an already-applied migration. The DB file defaults to `mydb.sqlite`, anchored to the project root via `import.meta.dir` rather than resolved against cwd — an MCP client sets the working directory when it spawns the server, so a relative path would fail with `SQLITE_CANTOPEN`. The `DB_PATH` env var overrides it verbatim (no anchoring, so `":memory:"` works).

### Key invariants

- **Money is stored as integer cents** (`gross_pay_cents`, `nett_pay_cents`) to avoid float drift on `SUM()`. The Ringgit ⇄ cents conversion happens **only** at the repository boundary (`toCents`/`toRinggit`); every layer above works in Ringgit numbers. Deductions are kept **negative** exactly as printed. Note `mapRow` converts in place and keeps the column names, so `Payslip.gross_pay_cents` / `nett_pay_cents` — and therefore the HTTP and MCP responses — carry **Ringgit** (e.g. `6000.55`) despite the `_cents` suffix. Renaming them is a breaking change to both surfaces; until then, don't "fix" a caller that treats them as Ringgit.
- **Line-item arrays** (earnings, deductions, employer contributions, year-to-date) are stored as JSON text columns, serialized/deserialized in `repository.ts`.
- **Derived fields are computed once on write, then stored.** `period_key` (sortable `YYYYMM`) and `type` (`"salary"` for a period-ending run paying basic pay, else `"bonus"`) are derived by `derivePeriodKey`/`derivePayslipType` in `insertPayslip` and persisted as real columns. Because they are columns, the `findPayslips` `periodKey` and `type` filters run **in SQL**, not in-memory. The trade-off: a change to either derivation rule only affects new rows, so it needs a backfill migration to apply to existing ones.
- **Import is idempotent two ways**: by SHA-256 hash of the raw PDF bytes (re-uploading identical bytes returns the stored record without re-parsing), and by `UNIQUE(employee_id, period)` (`INSERT ... ON CONFLICT DO NOTHING`). Employee is upserted by `employee_number`.
- **Bulk upload** — `POST /payslips` accepts a repeated `file` form field. One file → `201` with the record; multiple files → `207` with a per-file results array (order preserved) so one bad PDF doesn't fail the batch.

### PDF parsing

`parser.ts` uses `pdfjs-dist/legacy` build. `extractLines` is a thin PDF wrapper: it collects every page's `getTextContent().items` and hands them to **`linesFromItems`**, a pure function that reconstructs visual lines by grouping text items by y-coordinate (with a small `Y_TOLERANCE` for jitter), sorts left-to-right, and treats the leftmost item as the label and the rest as the value. `parseLines` then runs a section state machine (`header` → `earnings` → `deductions` → `ytd`) keyed off section-header labels. Parsing throws if any required header field, `GROSS PAY`, or `NETT PAY` is missing. Keeping the item→line grouping pure is what lets the parser be tested from a JSON fixture instead of a PDF.

## Testing

Tests use `bun:test` and need no secrets — `parser.test.ts` runs entirely off `fixtures/content.json`, verbatim `getTextContent()` output from a real payslip with every identity and money string replaced by a consistent fake, so it is safe to commit. The tests feed it through `linesFromItems` + `parseLines` and cover line grouping, header/section parsing, employer-contribution splitting, YTD, and the missing-field errors.

**Never commit real payslip data.** Real PDFs are gitignored (`fixtures/*.pdf`), and re-capturing `content.json` from a new payslip means anonymising every `str` value again first — see [src/modules/swift-payslips/fixtures/README.md](src/modules/swift-payslips/fixtures/README.md). Any test that reads a real PDF must gate on `fixtures/PAYSLIP.pdf` + `PAYSLIP_TEST_PASSWORD` ([.env.example](.env.example)) and skip when absent, and must not assert on real identity values.

`helper.test.ts` covers the pure layer directly: the cents ⇄ Ringgit round-trip (including the float-drift case that motivates integer cents), `derivePeriodKey` — including the silent `0` it returns for an unrecognised month or year — and both conditions of `derivePayslipType`.

**Test by risk, not by file.** Don't mirror the module tree with a `*.test.ts` per layer; an empty stub reads as coverage debt where none is owed. `service.ts` is thin orchestration with one real decision (the hash short-circuit before parsing) and `controller.ts` is request/response shaping — both are better covered end-to-end by driving the [index.ts](index.ts) routes with a real `Request` than by unit tests with mocked layers. `repository.ts` is where the invariants live and deserves tests against a real migrated SQLite instance.

Any test that touches the DB **must** set `DB_PATH` (to `":memory:"` or a scratch file) before importing anything that pulls in `src/infra/db/index.ts` — the connection is a module-level singleton, so an unset `DB_PATH` means the test writes to the dev database.
