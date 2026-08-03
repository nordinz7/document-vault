# Test fixtures

## `content.json` — committed, safe

Verbatim `page.getTextContent()` output (items + styles) captured from one real
payslip PDF, then **fully anonymised**: company, name, employee number,
IC/passport, EPF and tax numbers, and every money amount were replaced with
fakes. The `transform` coordinates are untouched, so line grouping, section
detection and ordering behave exactly like the real document.

The fake amounts stay internally consistent, which is what the reconciliation
test relies on:

| | |
| --- | --- |
| basic pay = gross pay | 6,420.00 |
| deductions | −1,058.15 |
| nett pay | 5,361.85 |

`parser.test.ts` drives `linesFromItems` + `parseLines` off this file, so the
whole parser is covered with no PDF and no password. When re-capturing this
fixture from a new payslip, **anonymise every identity and money string before
committing** — `str` values are the only place PII can hide.

## `PAYSLIP.pdf` — never committed

The real payslip. Contains PII; `*.pdf` in this directory is gitignored.

Nothing in the suite requires it today. Any test that does read it must gate on
its presence plus the PDF password, and skip when either is missing:

```
PAYSLIP_TEST_PASSWORD=your-pdf-password
```

(a local `.env` works — Bun loads it). Assert on parsed *shape*, never on real
names or numbers — those literals would land in git.
