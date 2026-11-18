-- =====================================================================
-- 매장닥터 2-B 플랜 개편 마이그레이션 (2026-11-19)
-- 1) usage_counters: 매장별 월간 OCR 및 AI 사용량 집계
-- 2) increment_usage RPC: 원자적 사용량 증가 (service_role 전용 권한 부여)
-- 3) report_ai_cache: Pro 이상 월간 보고서 AI 진단 캐시 (프롬프트 sha256 해시 기반)
-- 4) plan_overrides: QA/테스트 전용 관리자 플랜 오버라이드
-- =====================================================================

BEGIN;

-- 1. usage_counters 테이블 생성
CREATE TABLE IF NOT EXISTS public.usage_counters (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  year_month text NOT NULL CHECK (year_month ~ '^[0-9]{4}-[0-9]{2}$'),
  kind text NOT NULL CHECK (kind IN ('ocr', 'ai')),
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT usage_counters_store_ym_kind_unique UNIQUE (store_id, year_month, kind)
);

-- usage_counters RLS 설정
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view store usage counters" ON public.usage_counters;
CREATE POLICY "Members can view store usage counters" ON public.usage_counters
  FOR SELECT
  USING (
    store_id IN (
      SELECT store_id FROM public.store_members WHERE user_id = auth.uid()
      UNION
      SELECT id FROM public.stores WHERE owner_id = auth.uid()
    )
  );

-- 원자적 사용량 증가 RPC 함수 (search_path 고정 및 service_role 전용 권한 부여)
CREATE OR REPLACE FUNCTION public.increment_usage(
  p_store_id uuid,
  p_year_month text,
  p_kind text,
  p_amount integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_count integer;
BEGIN
  IF p_amount <= 0 THEN
    SELECT count INTO v_new_count
    FROM public.usage_counters
    WHERE store_id = p_store_id AND year_month = p_year_month AND kind = p_kind;
    RETURN COALESCE(v_new_count, 0);
  END IF;

  INSERT INTO public.usage_counters (store_id, year_month, kind, count, updated_at)
  VALUES (p_store_id, p_year_month, p_kind, p_amount, now())
  ON CONFLICT (store_id, year_month, kind)
  DO UPDATE SET
    count = public.usage_counters.count + EXCLUDED.count,
    updated_at = now()
  RETURNING count INTO v_new_count;

  RETURN v_new_count;
END;
$$;

-- 보안 강화: 일반 사용자(anon, authenticated) 권한 박탈 및 service_role에만 실행 권한 부여
REVOKE ALL ON FUNCTION public.increment_usage(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_usage(uuid, text, text, integer) TO service_role;


-- 2. report_ai_cache 테이블 생성
CREATE TABLE IF NOT EXISTS public.report_ai_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  prompt_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT report_ai_cache_store_hash_unique UNIQUE (store_id, prompt_hash)
);

-- report_ai_cache RLS 설정
ALTER TABLE public.report_ai_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view store report cache" ON public.report_ai_cache;
CREATE POLICY "Members can view store report cache" ON public.report_ai_cache
  FOR SELECT
  USING (
    store_id IN (
      SELECT store_id FROM public.store_members WHERE user_id = auth.uid()
      UNION
      SELECT id FROM public.stores WHERE owner_id = auth.uid()
    )
  );


-- 3. plan_overrides 테이블 생성 (QA/테스트 전용)
CREATE TABLE IF NOT EXISTS public.plan_overrides (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('free', 'basic', 'pro', 'premium')),
  expires_at timestamptz NOT NULL,
  note text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- plan_overrides RLS 설정 (service role 전용)
ALTER TABLE public.plan_overrides ENABLE ROW LEVEL SECURITY;

COMMIT;
