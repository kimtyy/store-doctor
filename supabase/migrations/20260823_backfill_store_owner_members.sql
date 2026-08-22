-- Backfill missing store owner records into store_members table
-- Joins with auth.users to ensure foreign key validity
-- Prevents duplicate insertion by checking WHERE NOT EXISTS for existing (store_id, user_id) combinations

INSERT INTO store_members (store_id, user_id, role)
SELECT s.id, s.owner_id, 'owner'
FROM stores s
JOIN auth.users u ON u.id = s.owner_id
WHERE NOT EXISTS (
  SELECT 1 
  FROM store_members sm 
  WHERE sm.store_id = s.id 
    AND sm.user_id = s.owner_id
);
