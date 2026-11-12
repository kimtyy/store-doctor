-- 이 파일만 실행하세요 (3단계: 결과 확인 SELECT + 복구 방법 안내)

-- [3-1] 중복 canonical key 그룹이 0건인지 확인 (결과 0행이어야 정상)
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

-- [3-2] 매장별 현재 menu_master 행 수 vs 백업 테이블 행 수 비교
SELECT
  coalesce(cur.store_id, bak.store_id) AS store_id,
  coalesce(bak.backup_count, 0) AS before_backup_rows,
  coalesce(cur.current_count, 0) AS after_current_rows,
  coalesce(bak.backup_count, 0) - coalesce(cur.current_count, 0) AS deleted_rows
FROM (
  SELECT store_id, count(*) AS current_count
  FROM public.menu_master
  GROUP BY store_id
) cur
FULL OUTER JOIN (
  SELECT store_id, count(*) AS backup_count
  FROM public.menu_master_backup_20261112
  GROUP BY store_id
) bak ON cur.store_id = bak.store_id
ORDER BY store_id;


-- ============================================================================
-- [복구 방법 예시] 문제가 있을 경우 백업 테이블(menu_master_backup_20261112)에서 원복
-- ============================================================================
-- BEGIN;
--
-- -- 1) 대표 행의 aliases / category / liquor_sub_category 를 백업 상태로 원복
-- UPDATE public.menu_master m
-- SET
--   aliases = b.aliases,
--   category = b.category,
--   liquor_sub_category = b.liquor_sub_category
-- FROM public.menu_master_backup_20261112 b
-- WHERE m.id = b.id;
--
-- -- 2) 삭제된 중복 행 다시 INSERT
-- INSERT INTO public.menu_master (id, store_id, menu_name, category, liquor_sub_category, aliases, created_at)
-- SELECT b.id, b.store_id, b.menu_name, b.category, b.liquor_sub_category, b.aliases, b.created_at
-- FROM public.menu_master_backup_20261112 b
-- WHERE NOT EXISTS (
--   SELECT 1 FROM public.menu_master m WHERE m.id = b.id
-- );
--
-- COMMIT;
