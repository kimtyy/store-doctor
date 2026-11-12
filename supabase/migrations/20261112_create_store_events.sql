-- [지시 1-N] 매장 사정(이벤트) 기록 테이블 생성
-- 재실행 안전: CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS, DROP TRIGGER IF EXISTS 사용

CREATE TABLE IF NOT EXISTS public.store_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 40),
  type text NOT NULL CHECK (
    type IN ('holiday', 'local_event', 'military', 'weather', 'closure', 'promotion', 'other')
  ),
  impact text NOT NULL DEFAULT 'unknown' CHECK (
    impact IN ('up', 'down', 'unknown')
  ),
  recurring_yearly boolean NOT NULL DEFAULT false,
  memo text CHECK (memo IS NULL OR char_length(memo) <= 200),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_events_date_range_check CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_store_events_store_start_date
  ON public.store_events (store_id, start_date);

-- 기존 updated_at 트리거 함수(001_create_schema.sql) 재사용
DROP TRIGGER IF EXISTS trigger_update_store_events_updated_at ON public.store_events;
CREATE TRIGGER trigger_update_store_events_updated_at
  BEFORE UPDATE ON public.store_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.store_events ENABLE ROW LEVEL SECURITY;

-- RLS: 기존 매장 테이블(stores.owner_id) + 활성 매장 구성원(store_members) 모두 읽기·쓰기 허용
DROP POLICY IF EXISTS "Store members can read store_events" ON public.store_events;
CREATE POLICY "Store members can read store_events"
  ON public.store_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_events.store_id AND s.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.store_members sm
      WHERE sm.store_id = store_events.store_id AND sm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Store members can insert store_events" ON public.store_events;
CREATE POLICY "Store members can insert store_events"
  ON public.store_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_events.store_id AND s.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.store_members sm
      WHERE sm.store_id = store_events.store_id AND sm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Store members can update store_events" ON public.store_events;
CREATE POLICY "Store members can update store_events"
  ON public.store_events
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_events.store_id AND s.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.store_members sm
      WHERE sm.store_id = store_events.store_id AND sm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_events.store_id AND s.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.store_members sm
      WHERE sm.store_id = store_events.store_id AND sm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Store members can delete store_events" ON public.store_events;
CREATE POLICY "Store members can delete store_events"
  ON public.store_events
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_events.store_id AND s.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.store_members sm
      WHERE sm.store_id = store_events.store_id AND sm.user_id = auth.uid()
    )
  );

