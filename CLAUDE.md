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
- `parser.ts` — PDF → `Payslip`, independent of DB and HTTP.
- `schema.ts` — shared types (domain `Payslip*` and DB `PayslipRecord`/`Employee` shapes).
- `helper.ts` — pure, dependency-free functions shared across layers: money conversion (`toCents`/`toRinggit`) and the derivations `derivePeriodKey`/`derivePayslipType`.

**Infrastructure** — [src/infra/db/index.ts](src/infra/db/index.ts) is connection-only (WAL mode, `foreign_keys = ON`) and deliberately does **not** create tables — this avoids an import cycle with the schema. [src/infra/db/migrate.ts](src/infra/db/migrate.ts) applies numbered `*.sql` files from `migrations/` in filename order, each in a transaction, recording applied names in `_migrations`. Add a new migration as `NNN_name.sql`; never edit an already-applied migration.

### Key invariants

- **Money is stored as integer cents** (`gross_pay_cents`, `nett_pay_cents`) to avoid float drift on `SUM()`. The Ringgit ⇄ cents conversion happens **only** at the repository boundary (`toCents`/`toRinggit`); every layer above works in Ringgit numbers. Deductions are kept **negative** exactly as printed.
- **Line-item arrays** (earnings, deductions, employer contributions, year-to-date) are stored as JSON text columns, serialized/deserialized in `repository.ts`.
- **Derived fields are computed on read, not stored.** `PayslipRecord.periodKey` (sortable `YYYYMM`) and `PayslipRecord.type` (`"salary"` for a period-ending run paying basic pay, else `"bonus"`) are computed in `mapRow` from the row's `period` and `earnings`, so they need no columns or migration. Because neither is a column, the `findPayslips` `periodKey` and `type` filters are applied in-memory after mapping, not in SQL.
- **Import is idempotent two ways**: by SHA-256 hash of the raw PDF bytes (re-uploading identical bytes returns the stored record without re-parsing), and by `UNIQUE(employee_id, period)` (`INSERT ... ON CONFLICT DO NOTHING`). Employee is upserted by `employee_number`.
- **Bulk upload** — `POST /payslips` accepts a repeated `file` form field. One file → `201` with the record; multiple files → `207` with a per-file results array (order preserved) so one bad PDF doesn't fail the batch.

### PDF parsing

`parser.ts` uses `pdfjs-dist/legacy` build. It reconstructs visual lines by grouping text items by y-coordinate (with a small `Y_TOLERANCE` for jitter), sorts left-to-right, treats the leftmost item as the label and the rest as the value, then runs a section state machine (`header` → `earnings` → `deductions` → `ytd`) keyed off section-header labels. Parsing throws if any required header field, `GROSS PAY`, or `NETT PAY` is missing.

## Testing

Tests use `bun:test`. `parser.test.ts` runs against a **real payslip fixture containing PII that is never committed** — it needs `fixtures/PAYSLIP.pdf` plus `PAYSLIP_TEST_PASSWORD` (a local `.env` works; Bun loads it). When either is absent the tests **skip** rather than fail, so CI stays green without the secret. See [.env.example](.env.example) and [src/modules/swift-payslips/fixtures/README.md](src/modules/swift-payslips/fixtures/README.md). The `controller`/`service`/`repository`/`schema` test files are currently empty stubs.
