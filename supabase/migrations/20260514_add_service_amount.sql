-- Supabase SQL 에디터에서 실행하세요
ALTER TABLE daily_sales
  ADD COLUMN IF NOT EXISTS service_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_sales   integer NOT NULL DEFAULT 0;

-- 기존 데이터: service_charge 값을 service_amount로 복사
UPDATE daily_sales
SET
  service_amount = COALESCE(service_charge, 0),
  actual_sales   = COALESCE(total_revenue, 0) - COALESCE(service_charge, 0)
WHERE service_amount = 0;
