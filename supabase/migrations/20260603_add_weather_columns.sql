-- Add weather columns to daily_sales
ALTER TABLE daily_sales ADD COLUMN weather_condition text;
ALTER TABLE daily_sales ADD COLUMN temperature integer;
