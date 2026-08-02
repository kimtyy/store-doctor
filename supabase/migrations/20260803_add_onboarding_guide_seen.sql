-- stores 테이블에 onboarding_guide_seen 컬럼 추가 (기본값 false)
ALTER TABLE stores
ADD COLUMN IF NOT EXISTS onboarding_guide_seen BOOLEAN DEFAULT FALSE;
