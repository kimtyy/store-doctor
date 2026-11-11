-- [지시 1-F] 결제 대기(pending) 상태 서버 차단 및 이중 결제 방지용 payment_attempts 테이블 생성
CREATE TABLE IF NOT EXISTS public.payment_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'resolved')),
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- 인덱스 생성 (사용자별 대기 상태 빠른 조회)
CREATE INDEX IF NOT EXISTS idx_payment_attempts_user_status ON public.payment_attempts (user_id, status);

-- RLS 활성화
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

-- 정책: 본인 행 읽기만 허용 (SELECT)
DROP POLICY IF EXISTS "Users can read own payment attempts" ON public.payment_attempts;
CREATE POLICY "Users can read own payment attempts"
    ON public.payment_attempts
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- 쓰기(INSERT/UPDATE/DELETE)는 RLS 정책이 없으므로 authenticated/anon 유저는 접근 불가,
-- service_role (서버 환경, getAdminClient / adminClient)만 우회하여 작업 가능.

