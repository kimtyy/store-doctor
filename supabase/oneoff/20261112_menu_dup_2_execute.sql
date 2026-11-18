-- 이 파일만 실행하세요 (2단계: 백업 테이블 생성 + 단일 트랜잭션 병합·삭제)
-- 주의: 반드시 1단계 미리보기 파일(20261112_menu_dup_1_preview.sql)을 먼저 확인한 뒤 실행하세요.
-- sales_menu_items 과거 데이터는 수정하지 않습니다.

-- 트랜잭션 밖에서 백업 테이블 먼저 생성
CREATE TABLE IF NOT EXISTS public.menu_master_backup_20261112 AS
SELECT * FROM public.menu_master;

BEGIN;

LOCK TABLE public.menu_master IN SHARE ROW EXCLUSIVE MODE;

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
