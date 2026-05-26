-- Add is_event column to daily_sales and purchase_records
-- is_event = true: 행사 매출/매입 (기본 분석에서 제외, 별도 표시)
-- is_event = false: 일반 매출/매입 (기본 분석에 포함)

ALTER TABLE daily_sales
  ADD COLUMN IF NOT EXISTS is_event boolean NOT NULL DEFAULT false;

ALTER TABLE purchase_records
  ADD COLUMN IF NOT EXISTS is_event boolean NOT NULL DEFAULT false;
