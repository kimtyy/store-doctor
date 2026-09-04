-- Create fixed_cost_execution_logs table for tracking fixed cost auto-applies
CREATE TABLE IF NOT EXISTS fixed_cost_execution_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  fixed_cost_id uuid REFERENCES fixed_costs(id) ON DELETE SET NULL,
  purchase_record_id uuid REFERENCES purchase_records(id) ON DELETE SET NULL,
  year_month text NOT NULL,
  status text NOT NULL,
  execution_type text NOT NULL DEFAULT 'auto',
  error_message text,
  executed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, fixed_cost_id, year_month)
);

-- Enable RLS
ALTER TABLE fixed_cost_execution_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'fixed_cost_execution_logs' AND policyname = 'Users can view fixed_cost_execution_logs for their stores'
  ) THEN
    CREATE POLICY "Users can view fixed_cost_execution_logs for their stores"
    ON fixed_cost_execution_logs FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM stores
        WHERE stores.id = fixed_cost_execution_logs.store_id
        AND stores.owner_id = auth.uid()
      )
    );
  END IF;
END $$;
