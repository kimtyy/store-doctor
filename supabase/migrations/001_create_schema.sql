-- Supabase schema migration for Store Doctor

-- UUID helper
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum types
CREATE TYPE purchase_category AS ENUM (
  'food_ingredients',
  'alcohol',
  'consumables',
  'labor',
  'rent',
  'electricity',
  'gas',
  'water',
  'telecom',
  'pos_fee',
  'insurance',
  'other'
);

CREATE TYPE sales_input_method AS ENUM (
  'receipt_photo',
  'screen_capture',
  'excel_upload',
  'manual'
);

CREATE TYPE purchase_input_method AS ENUM (
  'receipt_photo',
  'manual',
  'auto_fixed'
);

-- Stores table
CREATE TABLE stores (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Daily sales table
CREATE TABLE daily_sales (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  date date NOT NULL,
  total_revenue integer NOT NULL,
  discount integer NOT NULL DEFAULT 0,
  service_charge integer NOT NULL DEFAULT 0,
  tax integer NOT NULL DEFAULT 0,
  net_revenue integer NOT NULL,
  cash_count integer NOT NULL DEFAULT 0,
  cash_amount integer NOT NULL DEFAULT 0,
  card_count integer NOT NULL DEFAULT 0,
  card_amount integer NOT NULL DEFAULT 0,
  tables_used integer NOT NULL DEFAULT 0,
  guest_count integer NOT NULL DEFAULT 0,
  avg_spend integer NOT NULL DEFAULT 0,
  open_time text,
  close_time text,
  first_order_time text,
  input_method sales_input_method NOT NULL,
  receipt_image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, date)
);

-- Sales menu items table
CREATE TABLE sales_menu_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  daily_sale_id uuid NOT NULL REFERENCES daily_sales(id) ON DELETE CASCADE,
  name text NOT NULL,
  quantity integer NOT NULL,
  amount integer NOT NULL,
  category text,
  menu_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Purchase records table
CREATE TABLE purchase_records (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  date date NOT NULL,
  vendor_name text NOT NULL,
  total_amount integer NOT NULL,
  tax_amount integer NOT NULL DEFAULT 0,
  net_amount integer NOT NULL DEFAULT 0,
  category purchase_category NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  input_method purchase_input_method NOT NULL,
  receipt_image_url text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Fixed costs table
CREATE TABLE fixed_costs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  amount integer NOT NULL,
  category purchase_category NOT NULL,
  billing_day integer NOT NULL CHECK (billing_day >= 1 AND billing_day <= 31),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger helper to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_daily_sales_updated_at
BEFORE UPDATE ON daily_sales
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_sales_menu_items_updated_at
BEFORE UPDATE ON sales_menu_items
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_purchase_records_updated_at
BEFORE UPDATE ON purchase_records
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_fixed_costs_updated_at
BEFORE UPDATE ON fixed_costs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
