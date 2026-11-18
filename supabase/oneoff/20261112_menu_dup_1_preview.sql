-- 이 파일만 실행하세요 (1단계: 미리보기·충돌 점검 SELECT 전용, 쓰기 없음)
-- 전체 매장 대상 menu_master canonical key 중복 그룹 및 병합 전 점검 쿼리입니다.

-- [1-1] 중복 canonical key 그룹별 상세 및 대표(유지)/삭제 후보 미리보기
WITH sales_counts AS (
  SELECT
    ds.store_id,
    smi.name AS item_name,
    count(*)::bigint AS sales_item_count
  FROM public.sales_menu_items smi
  JOIN public.daily_sales ds ON ds.id = smi.daily_sale_id
  GROUP BY ds.store_id, smi.name
),
normalized AS (
  SELECT
    mm.id,
    mm.store_id,
    mm.menu_name,
    mm.category,
    mm.liquor_sub_category,
    mm.aliases,
    mm.created_at,
    lower(
      regexp_replace(
        normalize(mm.menu_name, NFKC),
        E'[\\s\\u00A0\\u3000\\u200B-\\u200D\\uFEFF\\u2060]',
        '',
        'g'
      )
    ) AS canonical_key,
    coalesce(sc.sales_item_count, 0) AS sales_item_count
  FROM public.menu_master mm
  LEFT JOIN sales_counts sc
    ON sc.store_id = mm.store_id
   AND sc.item_name = mm.menu_name
),
dup_groups AS (
  SELECT store_id, canonical_key
  FROM normalized
  GROUP BY store_id, canonical_key
  HAVING count(*) > 1
),
ranked AS (
  SELECT
    n.*,
    row_number() OVER (
      PARTITION BY n.store_id, n.canonical_key
      ORDER BY
        (nullif(btrim(n.category), '') IS NOT NULL) DESC,
        n.sales_item_count DESC,
        n.created_at ASC,
        n.id ASC
    ) AS rn
  FROM normalized n
  JOIN dup_groups dg
    ON dg.store_id = n.store_id
   AND dg.canonical_key = n.canonical_key
)
SELECT
  store_id,
  canonical_key,
  id,
  menu_name,
  category,
  liquor_sub_category,
  aliases,
  created_at,
  sales_item_count,
  CASE WHEN rn = 1 THEN '대표(유지)' ELSE '중복(병합 후 삭제)' END AS action_role
FROM ranked
ORDER BY store_id, canonical_key, rn;


-- [1-2] 그룹 내 category가 서로 다른 충돌 그룹 목록
WITH normalized AS (
  SELECT
    store_id,
    menu_name,
    nullif(btrim(category), '') AS clean_category,
    lower(
      regexp_replace(
        normalize(menu_name, NFKC),
        E'[\\s\\u00A0\\u3000\\u200B-\\u200D\\uFEFF\\u2060]',
        '',
        'g'
      )
    ) AS canonical_key
  FROM public.menu_master
)
SELECT
  store_id,
  canonical_key,
  array_agg(menu_name ORDER BY menu_name) AS menu_names,
  array_agg(DISTINCT clean_category) FILTER (WHERE clean_category IS NOT NULL) AS distinct_categories
FROM normalized
GROUP BY store_id, canonical_key
HAVING count(*) > 1
   AND count(DISTINCT clean_category) > 1
ORDER BY store_id, canonical_key;


-- [1-3] 대상 store_id별 중복 그룹 수 요약
WITH normalized AS (
  SELECT
    store_id,
    lower(
      regexp_replace(
        normalize(menu_name, NFKC),
        E'[\\s\\u00A0\\u3000\\u200B-\\u200D\\uFEFF\\u2060]',
        '',
        'g'
      )
    ) AS canonical_key
  FROM public.menu_master
),
dup_groups AS (
  SELECT store_id, canonical_key, count(*) AS row_count
  FROM normalized
  GROUP BY store_id, canonical_key
  HAVING count(*) > 1
)
SELECT
  store_id,
  count(*) AS duplicate_group_count,
  sum(row_count - 1) AS rows_to_delete
FROM dup_groups
GROUP BY store_id
ORDER BY store_id;


-- [1-4] 병합 결과 별칭이 같은 매장 내 다른 행(다른 canonical key)의 이름·별칭 키와 겹치는지 점검 (0건 기대)
WITH normalized AS (
  SELECT
    id,
    store_id,
    menu_name,
    aliases,
    lower(
      regexp_replace(
        normalize(menu_name, NFKC),
        E'[\\s\\u00A0\\u3000\\u200B-\\u200D\\uFEFF\\u2060]',
        '',
        'g'
      )
    ) AS canonical_key
  FROM public.menu_master
),
dup_groups AS (
  SELECT store_id, canonical_key
  FROM normalized
  GROUP BY store_id, canonical_key
  HAVING count(*) > 1
),
merged_alias_keys AS (
  SELECT DISTINCT
    n.store_id,
    n.canonical_key AS source_group_key,
    alias_val,
    lower(
      regexp_replace(
        normalize(alias_val, NFKC),
        E'[\\s\\u00A0\\u3000\\u200B-\\u200D\\uFEFF\\u2060]',
        '',
        'g'
      )
    ) AS alias_key
  FROM normalized n
  JOIN dup_groups dg
    ON dg.store_id = n.store_id
   AND dg.canonical_key = n.canonical_key
  CROSS JOIN LATERAL (
    SELECT unnest(coalesce(n.aliases, ARRAY[]::text[])) AS alias_val
    UNION ALL
    SELECT n.menu_name AS alias_val
  ) a
  WHERE nullif(btrim(alias_val), '') IS NOT NULL
),
other_row_keys AS (
  SELECT
    m.store_id,
    m.id AS other_id,
    m.menu_name AS other_menu_name,
    m.canonical_key AS other_group_key,
    lower(
      regexp_replace(
        normalize(k_val, NFKC),
        E'[\\s\\u00A0\\u3000\\u200B-\\u200D\\uFEFF\\u2060]',
        '',
        'g'
      )
    ) AS other_key
  FROM normalized m
  CROSS JOIN LATERAL (
    SELECT m.menu_name AS k_val
    UNION ALL
    SELECT unnest(coalesce(m.aliases, ARRAY[]::text[])) AS k_val
  ) k
  WHERE nullif(btrim(k_val), '') IS NOT NULL
)
SELECT
  ma.store_id,
  ma.source_group_key,
  ma.alias_val,
  o.other_id,
  o.other_menu_name,
  o.other_group_key
FROM merged_alias_keys ma
JOIN other_row_keys o
  ON o.store_id = ma.store_id
 AND o.other_key = ma.alias_key
 AND o.other_group_key <> ma.source_group_key
ORDER BY ma.store_id, ma.source_group_key;
