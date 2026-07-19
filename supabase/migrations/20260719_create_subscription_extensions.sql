-- Create subscription_extensions table
CREATE TABLE IF NOT EXISTS public.subscription_extensions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    months INTEGER NOT NULL CHECK (months >= 1 AND months <= 12),
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.subscription_extensions ENABLE ROW LEVEL SECURITY;

-- Create policy for users to select their own subscription extension records
CREATE POLICY "Users can view their own subscription extensions" ON public.subscription_extensions
    FOR SELECT USING (auth.uid() = user_id);

-- Note: The service_role client automatically bypasses RLS policies, so no additional policies are needed for it.
