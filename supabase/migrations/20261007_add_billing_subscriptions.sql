-- Add billing and recurring payment columns to subscriptions
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS customer_key TEXT,
ADD COLUMN IF NOT EXISTS billing_key TEXT,
ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

-- Update status check constraint to include past_due and 연체
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check 
CHECK (status IN ('active', 'expired', 'cancelled', 'past_due', '연체'));
