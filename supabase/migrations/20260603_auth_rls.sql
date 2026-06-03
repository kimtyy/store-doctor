-- 1. Create Invite Codes Table
CREATE TABLE invite_codes (
  code text PRIMARY KEY,
  is_used boolean NOT NULL DEFAULT false,
  used_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Insert some initial dummy invite codes for testing
INSERT INTO invite_codes (code) VALUES
('BETA-WELCOME-2026'),
('BETA-TESTER-001'),
('BETA-TESTER-002'),
('BETA-TESTER-003');

-- 2. Add category and region to stores
ALTER TABLE stores ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS region text;

-- 3. Enable RLS on all tables
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

-- 3. Create Policies

-- Invite Codes Policy (Public can view unused codes to check validity during signup, admins can do all)
CREATE POLICY "Public can view unused invite codes"
ON invite_codes FOR SELECT
TO public
USING (is_used = false);

CREATE POLICY "Authenticated users can update invite codes"
ON invite_codes FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Stores Policy
CREATE POLICY "Users can view own store"
ON stores FOR SELECT
TO authenticated
USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own store"
ON stores FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own store"
ON stores FOR UPDATE
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete own store"
ON stores FOR DELETE
TO authenticated
USING (owner_id = auth.uid());

-- Daily Sales Policy
CREATE POLICY "Users can manage their daily_sales"
ON daily_sales FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM stores
    WHERE stores.id = daily_sales.store_id
    AND stores.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM stores
    WHERE stores.id = daily_sales.store_id
    AND stores.owner_id = auth.uid()
  )
);

-- Sales Menu Items Policy
CREATE POLICY "Users can manage their sales_menu_items"
ON sales_menu_items FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM daily_sales
    JOIN stores ON stores.id = daily_sales.store_id
    WHERE daily_sales.id = sales_menu_items.daily_sale_id
    AND stores.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM daily_sales
    JOIN stores ON stores.id = daily_sales.store_id
    WHERE daily_sales.id = sales_menu_items.daily_sale_id
    AND stores.owner_id = auth.uid()
  )
);

-- Purchase Records Policy
CREATE POLICY "Users can manage their purchase_records"
ON purchase_records FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM stores
    WHERE stores.id = purchase_records.store_id
    AND stores.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM stores
    WHERE stores.id = purchase_records.store_id
    AND stores.owner_id = auth.uid()
  )
);

-- Fixed Costs Policy
CREATE POLICY "Users can manage their fixed_costs"
ON fixed_costs FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM stores
    WHERE stores.id = fixed_costs.store_id
    AND stores.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM stores
    WHERE stores.id = fixed_costs.store_id
    AND stores.owner_id = auth.uid()
  )
);
