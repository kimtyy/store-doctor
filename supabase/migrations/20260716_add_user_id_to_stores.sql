-- stores 테이블에 user_id 컬럼 추가
ALTER TABLE stores 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- kimtyy@gmail.com의 uid로 업데이트
UPDATE stores 
SET user_id = (
  SELECT id FROM auth.users 
  WHERE email = 'kimtyy@gmail.com'
)
WHERE id = '8de2930d-a196-4aa1-b9bf-7fa83321b10c';
