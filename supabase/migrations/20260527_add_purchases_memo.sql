-- purchase_records 테이블에 memo 컬럼 추가
ALTER TABLE purchase_records ADD COLUMN IF NOT EXISTS memo TEXT;
