-- OKPOS 과거 매출 가져오기: 0원 날 채우기 취소 복원을 위한 컬럼 추가
ALTER TABLE import_batches
ADD COLUMN IF NOT EXISTS updated_zero_sales jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN import_batches.updated_zero_sales IS '0원 날 채우기로 기존 daily_sales를 UPDATE한 행들의 ID 및 원본 상태 목록 (가져오기 취소 시 0원 복원용)';
