-- [지시 1-L] 메뉴 주류 소분류 지원을 위한 menu_master 컬럼 확장
-- 대분류(주류·안주·식사·기타)는 기존 menu_master.category(주류/음료/안주/식사/세트)를 원본으로 사용하고 코드에서 매핑합니다.
-- 실제 운영 DB에서 사용자가 SQL Editor로 먼저 실행합니다.
ALTER TABLE public.menu_master
  ADD COLUMN IF NOT EXISTS liquor_sub_category text;
