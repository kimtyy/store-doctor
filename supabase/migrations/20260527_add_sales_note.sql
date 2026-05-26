-- Add note column to daily_sales
ALTER TABLE daily_sales
  ADD COLUMN IF NOT EXISTS note text;
