-- subscriptions 테이블에 마지막 성공 결제일(last_paid_at) 및 토스 주문번호(last_order_id) 컬럼 추가
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS last_paid_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_order_id TEXT;

