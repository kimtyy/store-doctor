-- [지시 1-K] 외식업 표준 비용 분류(7개 그룹) 지원을 위한 purchase_category ENUM 확장
-- 참고: fuel은 실제 운영 DB에 이미 존재할 수 있으며, 신규 환경 재현을 위해 IF NOT EXISTS로 포함합니다.
-- 기존 데이터는 코드의 카테고리→그룹 매핑으로 처리하며 일괄 변경하지 않습니다.
ALTER TYPE public.purchase_category ADD VALUE IF NOT EXISTS 'management_fee';
ALTER TYPE public.purchase_category ADD VALUE IF NOT EXISTS 'card_fee';
ALTER TYPE public.purchase_category ADD VALUE IF NOT EXISTS 'delivery_fee';
ALTER TYPE public.purchase_category ADD VALUE IF NOT EXISTS 'fuel';
