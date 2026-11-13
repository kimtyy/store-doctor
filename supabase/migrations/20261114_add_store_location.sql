-- stores 테이블에 주소, 위도, 경도 컬럼 추가 및 설맥현리점 초기 좌표 설정
ALTER TABLE stores
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS latitude double precision,
ADD COLUMN IF NOT EXISTS longitude double precision;

-- 설맥현리점(store_id: 23197c4f-5bec-40e2-b494-826083721faa) 초기 좌표 설정 (조종면 현리 37.8256, 127.3505)
UPDATE stores
SET
  address = COALESCE(address, '경기도 가평군 조종면 현리'),
  latitude = 37.8256,
  longitude = 127.3505,
  updated_at = now()
WHERE id = '23197c4f-5bec-40e2-b494-826083721faa';

