ALTER TABLE public.payment_attempts DROP CONSTRAINT IF EXISTS payment_attempts_status_check;
ALTER TABLE public.payment_attempts ADD CONSTRAINT payment_attempts_status_check CHECK (status IN ('processing','pending','resolved'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_attempts_user_active ON public.payment_attempts (user_id) WHERE status IN ('processing','pending');

