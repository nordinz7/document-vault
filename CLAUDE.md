# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Runtime is [Bun](https://bun.com) (not Node) — use `bun`, never `npm`/`node`.

- `bun install` — install dependencies
- `bun run dev` — run the server with hot reload (`bun run --hot index.ts`)
- `bun run index.ts` — run the server once
- `bun test` — run all tests
- `bun test src/modules/swift-payslips/parser.test.ts` — run one test file
- `bun test -t "parses deductions"` — run tests matching a name

`migrate()` runs automatically at server startup ([index.ts](index.ts)); there is no separate migration command.

## Architecture

A Bun HTTP service that ingests Swift Haulage payslip PDFs, parses them into structured records, and stores them in a local SQLite database.

**Entry point** — [index.ts](index.ts) defines all routes inline via `Bun.serve({ routes })` (requires Bun ≥ 1.2.3) and wires them to controller functions. There is no router framework.

**Layered module** — [src/modules/swift-payslips/](src/modules/swift-payslips/) is split by responsibility, and the layering is strict; keep concerns in their layer:
- `controller.ts` — HTTP only. Parses requests, shapes responses/status codes, catches errors. Knows nothing about SQL.
- `service.ts` — orchestration/business logic. No HTTP, no SQL. Owns the import flow and transaction boundaries.
- `repository.ts` — the **only** layer that touches SQL and column names.
- `parser.ts` — PDF → `ParsedPayslip`, independent of DB and HTTP.
- `types.ts` — shared types. `PayslipRecord` is the raw SQLite row (snake_case, cents, JSON text) and is repository-internal; `Payslip` is the domain shape (camelCase, Ringgit, `Date`s, derived fields) that the service and controller surface. `mapRow` is the only crossing point. Don't mix them up — the names read as if reversed.
- `helper.ts` — pure, dependency-free functions shared across layers: money conversion (`toCents`/`toRinggit`) and the derivations `derivePeriodKey`/`derivePayslipType`.

**Infrastructure** — [src/infra/db/index.ts](src/infra/db/index.ts) is connection-only (WAL mode, `foreign_keys = ON`) and deliberately does **not** create tables — this avoids an import cycle with the schema. [src/infra/db/migrate.ts](src/infra/db/migrate.ts) applies numbered `*.sql` files from `migrations/` in filename order, each in a transaction, recording applied names in `_migrations`. Add a new migration as `NNN_name.sql`; never edit an already-applied migration. The DB file defaults to `mydb.sqlite` at the project root; the `DB_PATH` env var overrides it verbatim (so `":memory:"` works).

### Key invariants

- **Money is stored as integer cents** (`gross_pay_cents`, `nett_pay_cents`) to avoid float drift on `SUM()`. The Ringgit ⇄ cents conversion happens **only** at the repository boundary (`toCents`/`toRinggit`); every layer above works in Ringgit numbers. Deductions are kept **negative** exactly as printed.
- **Line-item arrays** (earnings, deductions, employer contributions, year-to-date) are stored as JSON text columns, serialized/deserialized in `repository.ts`.
- **Derived fields are computed on read, not stored.** `Payslip.periodKey` (sortable `YYYYMM`) and `Payslip.type` (`"salary"` for a period-ending run paying basic pay, else `"bonus"`) are computed in `mapRow` from the row's `period` and `earnings`, so they need no columns or migration. Because neither is a column, the `findPayslips` `periodKey` and `type` filters are applied in-memory after mapping, not in SQL.
- **Import is idempotent two ways**: by SHA-256 hash of the raw PDF bytes (re-uploading identical bytes returns the stored record without re-parsing), and by `UNIQUE(employee_id, period)` (`INSERT ... ON CONFLICT DO NOTHING`). Employee is upserted by `employee_number`.
- **Bulk upload** — `POST /payslips` accepts a repeated `file` form field. One file → `201` with the record; multiple files → `207` with a per-file results array (order preserved) so one bad PDF doesn't fail the batch.

### PDF parsing

`parser.ts` uses `pdfjs-dist/legacy` build. `extractLines` is a thin PDF wrapper: it collects every page's `getTextContent().items` and hands them to **`linesFromItems`**, a pure function that reconstructs visual lines by grouping text items by y-coordinate (with a small `Y_TOLERANCE` for jitter), sorts left-to-right, and treats the leftmost item as the label and the rest as the value. `parseLines` then runs a section state machine (`header` → `earnings` → `deductions` → `ytd`) keyed off section-header labels. Parsing throws if any required header field, `GROSS PAY`, or `NETT PAY` is missing. Keeping the item→line grouping pure is what lets the parser be tested from a JSON fixture instead of a PDF.

## Testing

Tests use `bun:test` and need no secrets — `parser.test.ts` runs entirely off `fixtures/content.json`, verbatim `getTextContent()` output from a real payslip with every identity and money string replaced by a consistent fake, so it is safe to commit. The tests feed it through `linesFromItems` + `parseLines` and cover line grouping, header/section parsing, employer-contribution splitting, YTD, and the missing-field errors.

**Never commit real payslip data.** Real PDFs are gitignored (`fixtures/*.pdf`), and re-capturing `content.json` from a new payslip means anonymising every `str` value again first — see [src/modules/swift-payslips/fixtures/README.md](src/modules/swift-payslips/fixtures/README.md). Any test that reads a real PDF must gate on `fixtures/PAYSLIP.pdf` + `PAYSLIP_TEST_PASSWORD` ([.env.example](.env.example)) and skip when absent, and must not assert on real identity values.

The `controller`/`service`/`repository`/`schema` test files are currently empty stubs.
