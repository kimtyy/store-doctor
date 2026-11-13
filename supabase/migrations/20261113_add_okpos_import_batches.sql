-- OKPOS 과거 매출 가져오기(import_batches) 테이블 및 외래키 컬럼 추가
-- 주의: import_batches의 INSERT / UPDATE / DELETE RLS 정책은 만들지 않습니다 (서버 Service Role 전용).
--       클라이언트는 오직 SELECT(자신이 속한 매장의 묶음 목록 조회)만 가능합니다.

-- 1. import_batches 테이블 신설
CREATE TABLE IF NOT EXISTS import_batches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'okpos_menu_daily',
  year_month text NOT NULL, -- 'YYYY-MM'
  file_name text NOT NULL,
  file_sha256 text NOT NULL,
  days_written integer NOT NULL DEFAULT 0,
  menu_rows integer NOT NULL DEFAULT 0,
  total_amount bigint NOT NULL DEFAULT 0,
  mode text NOT NULL CHECK (mode IN ('fill', 'overwrite')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz NULL
);

-- 인덱스 2개
CREATE INDEX IF NOT EXISTS idx_import_batches_store_ym ON import_batches(store_id, year_month);
CREATE INDEX IF NOT EXISTS idx_import_batches_sha256 ON import_batches(store_id, file_sha256);

-- 2. daily_sales 및 sales_menu_items에 import_batch_id 추가 및 인덱스
ALTER TABLE daily_sales ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL;
ALTER TABLE sales_menu_items ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES import_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_daily_sales_import_batch ON daily_sales(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_sales_menu_items_import_batch ON sales_menu_items(import_batch_id);

-- 3. RLS 정책: 매장 구성원 SELECT만 허용 (CUD 정책 없음)
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view store import_batches"
ON import_batches FOR SELECT
USING (
  store_id IN (
    SELECT s.id FROM stores s
    WHERE s.owner_id = auth.uid()
    UNION
    SELECT sm.store_id FROM store_members sm
    WHERE sm.user_id = auth.uid()
  )
);

