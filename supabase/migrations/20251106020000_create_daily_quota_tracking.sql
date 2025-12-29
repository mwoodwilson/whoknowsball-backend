-- Create daily_quota_tracking table for tracking daily API usage
CREATE TABLE IF NOT EXISTS public.daily_quota_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    api_name TEXT NOT NULL,
    requests_used INTEGER NOT NULL DEFAULT 0,
    quota_limit INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(date, api_name)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_daily_quota_date_api ON public.daily_quota_tracking(date, api_name);

-- Create function to increment daily quota
CREATE OR REPLACE FUNCTION increment_daily_quota(p_date DATE, p_api_name TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE public.daily_quota_tracking
    SET requests_used = requests_used + 1,
        updated_at = NOW()
    WHERE date = p_date AND api_name = p_api_name;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT ALL ON public.daily_quota_tracking TO authenticated;
GRANT ALL ON public.daily_quota_tracking TO service_role;
GRANT EXECUTE ON FUNCTION increment_daily_quota(DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_daily_quota(DATE, TEXT) TO service_role;
