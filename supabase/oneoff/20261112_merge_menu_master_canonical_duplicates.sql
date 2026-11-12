-- [지시 1-L3] 기존 menu_master canonical key 중복 1회성 정리 SQL (전체 매장 대상, 실행은 수동 확인 후 진행)
-- 주의: 1단계 미리보기 SELECT로 결과를 먼저 확인한 뒤, 2단계 BEGIN..COMMIT 블록을 실행하고, 3단계 확인 SELECT로 검증하세요.
-- sales_menu_items 과거 데이터는 수정하지 않습니다.

-- ============================================================================
-- [1단계 미리보기 SELECT] 중복 canonical key 그룹 및 대표/삭제 후보 확인
-- ============================================================================
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


-- ============================================================================
-- [2단계 실행] 대표 행에 별칭/카테고리 병합 후 나머지 중복 행 삭제 (단일 트랜잭션)
-- ============================================================================
BEGIN;

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
),
group_merged AS (
  SELECT
    rep.id AS rep_id,
    rep.menu_name AS rep_menu_name,
    coalesce(
      nullif(btrim(rep.category), ''),
      (
        SELECT nullif(btrim(r2.category), '')
        FROM ranked r2
        WHERE r2.store_id = rep.store_id
          AND r2.canonical_key = rep.canonical_key
          AND nullif(btrim(r2.category), '') IS NOT NULL
        ORDER BY r2.rn ASC
        LIMIT 1
      )
    ) AS merged_category,
    coalesce(
      nullif(btrim(rep.liquor_sub_category), ''),
      (
        SELECT nullif(btrim(r2.liquor_sub_category), '')
        FROM ranked r2
        WHERE r2.store_id = rep.store_id
          AND r2.canonical_key = rep.canonical_key
          AND nullif(btrim(r2.liquor_sub_category), '') IS NOT NULL
        ORDER BY r2.rn ASC
        LIMIT 1
      )
    ) AS merged_liquor_sub,
    (
      SELECT coalesce(array_agg(DISTINCT alias_val ORDER BY alias_val), ARRAY[]::text[])
      FROM (
        SELECT unnest(coalesce(r_all.aliases, ARRAY[]::text[])) AS alias_val
        FROM ranked r_all
        WHERE r_all.store_id = rep.store_id
          AND r_all.canonical_key = rep.canonical_key
        UNION
        SELECT r_other.menu_name AS alias_val
        FROM ranked r_other
        WHERE r_other.store_id = rep.store_id
          AND r_other.canonical_key = rep.canonical_key
          AND r_other.id <> rep.id
      ) raw_aliases
      WHERE nullif(btrim(alias_val), '') IS NOT NULL
        AND alias_val <> rep.menu_name
    ) AS merged_aliases
  FROM ranked rep
  WHERE rep.rn = 1
)
UPDATE public.menu_master m
SET
  aliases = gm.merged_aliases,
  category = gm.merged_category,
  liquor_sub_category = CASE
    WHEN gm.merged_category = '주류' THEN gm.merged_liquor_sub
    ELSE NULL
  END
FROM group_merged gm
WHERE m.id = gm.rep_id;

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
    n.id,
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
DELETE FROM public.menu_master m
USING ranked r
WHERE m.id = r.id
  AND r.rn > 1;

COMMIT;


-- ============================================================================
-- [3단계 확인 SELECT] 중복 키 0건 확인 및 매장별 menu_master 행 수 확인
-- ============================================================================
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
)
SELECT
  store_id,
  canonical_key,
  count(*) AS remaining_count
FROM normalized
GROUP BY store_id, canonical_key
HAVING count(*) > 1;

SELECT
  store_id,
  count(*) AS total_menu_master_rows
FROM public.menu_master
GROUP BY store_id
ORDER BY store_id;

