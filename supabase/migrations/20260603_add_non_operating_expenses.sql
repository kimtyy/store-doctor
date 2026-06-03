-- Migration to add non-operating expenses to stores table
ALTER TABLE stores
ADD COLUMN IF NOT EXISTS owner_salary integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS loan_repayment integer NOT NULL DEFAULT 0;
