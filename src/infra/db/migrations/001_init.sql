CREATE TABLE IF NOT EXISTS employee (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  cost_center TEXT,
  ic_passport TEXT,
  epf_number TEXT,
  tax_number TEXT,
  company TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS payslip_record (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  -- "salary" or "bonus"
  period TEXT NOT NULL,
  period_key INTEGER NOT NULL,
  -- YYYYMM sortable key derived from period
  earnings TEXT NOT NULL,
  -- JSON: PayslipLineItem[]
  deductions TEXT NOT NULL,
  -- JSON: PayslipLineItem[]
  employer_contributions TEXT NOT NULL,
  -- JSON: PayslipLineItem[]
  year_to_date TEXT NOT NULL,
  -- JSON: PayslipLineItem[]
  gross_pay_cents INTEGER NOT NULL,
  -- money as integer cents (no float drift on SUM)
  nett_pay_cents INTEGER NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  -- SHA-256 of the source PDF
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employee(id),
  UNIQUE (employee_id, period) -- re-importing the same period is idempotent
);