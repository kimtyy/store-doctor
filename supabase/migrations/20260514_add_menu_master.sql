-- menu_master: canonical menu names with categories and OCR aliases
CREATE TABLE IF NOT EXISTS menu_master (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  menu_name    text NOT NULL,
  category     text,
  aliases      text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, menu_name)
);

CREATE INDEX IF NOT EXISTS menu_master_store_id_idx ON menu_master (store_id);
