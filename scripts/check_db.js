const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data: codes } = await supabase.from('invite_codes').select('*');
  console.log('Invite Codes:', codes);

  const { data: stores } = await supabase.from('stores').select('*');
  console.log('Stores:', stores);
}

check();
