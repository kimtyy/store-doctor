-- subscriptions 테이블에 연속 불확실 처리 일수 및 알림 기록 컬럼 추가
-- [지시 1-C] 결제 결과가 불확실한 경우(네트워크 오류, 타임아웃 등) 재청구 방지 및 3일 연속 불확실 추적용
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS unconfirmed_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_unconfirmed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS unconfirmed_notified_at TIMESTAMP WITH TIME ZONE;
