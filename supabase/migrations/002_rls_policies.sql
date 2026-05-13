-- Enable Row Level Security and policies for Store Doctor

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_costs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert stores they own
CREATE POLICY "Allow owners to insert stores"
ON stores
FOR INSERT
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Allow owners to select stores"
ON stores
FOR SELECT
USING (owner_id = auth.uid());

CREATE POLICY "Allow owners to update stores"
ON stores
FOR UPDATE
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Allow owners to delete stores"
ON stores
FOR DELETE
USING (owner_id = auth.uid());

-- daily_sales policies through store ownership
CREATE POLICY "Allow store owners to manage daily sales"
ON daily_sales
FOR ALL
USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()))
WITH CHECK (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

-- sales_menu_items policies through daily_sales ownership
CREATE POLICY "Allow owners to manage sales menu items"
ON sales_menu_items
FOR ALL
USING (daily_sale_id IN (SELECT id FROM daily_sales WHERE store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())))
WITH CHECK (daily_sale_id IN (SELECT id FROM daily_sales WHERE store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())));

-- purchase_records policies through store ownership
CREATE POLICY "Allow store owners to manage purchase records"
ON purchase_records
FOR ALL
USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()))
WITH CHECK (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

-- fixed_costs policies through store ownership
CREATE POLICY "Allow store owners to manage fixed costs"
ON fixed_costs
FOR ALL
USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()))
WITH CHECK (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));
