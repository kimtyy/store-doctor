-- 미분류 및 처음 보는 메뉴 집계를 위한 매장별 메뉴 요약 RPC 함수
-- sales_menu_items 전체 행(수만 행)을 읽는 대신 DB에서 (name, category) 단위로 GROUP BY 집계하여 반환합니다.
-- service_role만 실행할 수 있도록 권한을 제한합니다.

CREATE OR REPLACE FUNCTION get_store_sales_menu_summary(p_store_id uuid)
RETURNS TABLE (
  name text,
  category text,
  item_count bigint
) LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public AS $$
  SELECT 
    smi.name,
    smi.category,
    COUNT(*)::bigint AS item_count
  FROM sales_menu_items smi
  JOIN daily_sales ds ON ds.id = smi.daily_sale_id
  WHERE ds.store_id = p_store_id
    AND smi.name IS NOT NULL
  GROUP BY smi.name, smi.category;
$$;

REVOKE ALL ON FUNCTION get_store_sales_menu_summary(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_store_sales_menu_summary(uuid) TO service_role;
