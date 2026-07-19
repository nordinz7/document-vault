# Test fixtures

Payslip PDFs used by `parser.test.ts`. These contain real PII and are **never
committed** — `*.pdf` here is gitignored.

To run the parser tests locally:

1. Place the payslip at `PAYSLIP.pdf` in this directory.
2. Set the PDF password via env (a local `.env` file works — Bun loads it):

   ```
   PAYSLIP_TEST_PASSWORD=your-pdf-password
   ```

If either is missing, the parser tests skip instead of failing.
