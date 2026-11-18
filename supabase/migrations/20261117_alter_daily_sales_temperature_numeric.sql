-- daily_sales 테이블의 temperature 컬럼을 integer에서 numeric(4,1)로 변경
-- 과거 날씨 일괄 재채움(W-2)에서 소수점 1자리 일평균 기온(-11.1°C 등)을 저장하기 위함
ALTER TABLE daily_sales ALTER COLUMN temperature TYPE numeric(4,1);
