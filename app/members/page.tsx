import { redirect } from 'next/navigation';
import { getUserRole } from '@/utils/supabase/getUserRole';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import MembersClient from './MembersClient';

export const dynamic = 'force-dynamic';

export default async function MembersPage() {
  // 1. Owner authorization check
  const role = await getUserRole();
  if (role !== 'owner') {
    redirect('/dashboard');
  }

  // 2. Fetch logged in user details
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  // 3. Find owned store details
  const { data: store, error: storeErr } = await supabase
    .from('stores')
    .select('id, name')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (storeErr || !store) {
    redirect('/onboarding');
  }

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 4. Fetch store members from DB
  const { data: members, error: membersErr } = await adminSupabase
    .from('store_members')
    .select('*')
    .eq('store_id', store.id);

  if (membersErr) {
    throw new Error(`Failed to load members: ${membersErr.message}`);
  }

  // 5. Fetch auth users to map emails in memory
  const { data: { users: authUsers }, error: authUsersErr } = await adminSupabase.auth.admin.listUsers();
  if (authUsersErr) {
    throw new Error('Failed to load user email list');
  }

  const emailMap = new Map<string, string>();
  authUsers.forEach((u) => {
    if (u.email) emailMap.set(u.id, u.email);
  });

  const initialMembers = (members || []).map((m) => ({
    id: m.id,
    store_id: m.store_id,
    user_id: m.user_id,
    role: m.role,
    created_at: m.created_at,
    email: emailMap.get(m.user_id) || '알 수 없음(삭제된 계정)',
  }));

  // 6. Fetch pending invitations
  const { data: invites, error: invitesErr } = await adminSupabase
    .from('store_invites')
    .select('*')
    .eq('store_id', store.id)
    .eq('accepted', false);

  if (invitesErr) {
    throw new Error(`Failed to load invites: ${invitesErr.message}`);
  }

  return (
    <MembersClient
      storeName={store.name}
      initialMembers={initialMembers}
      initialInvites={invites || []}
      currentUserId={user.id}
    />
  );
}
