import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getUserRole } from '@/utils/supabase/getUserRole';

export const dynamic = 'force-dynamic';

// GET /api/members
export async function GET() {
  const role = await getUserRole();
  if (role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Get the store owned by the owner
    const { data: store, error: storeErr } = await supabase
      .from('stores')
      .select('id, name')
      .eq('owner_id', user.id)
      .maybeSingle();

    if (storeErr || !store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // Initialize admin client to fetch user emails and invites securely
    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 2. Fetch all members of the store
    const { data: members, error: membersErr } = await adminSupabase
      .from('store_members')
      .select('*')
      .eq('store_id', store.id);

    if (membersErr) {
      return NextResponse.json({ error: membersErr.message }, { status: 500 });
    }

    // 3. Fetch all user accounts to map email in memory (REST limit workaround)
    const { data: { users: authUsers }, error: authUsersErr } = await adminSupabase.auth.admin.listUsers();
    if (authUsersErr) {
      return NextResponse.json({ error: 'Failed to fetch user accounts' }, { status: 500 });
    }

    const emailMap = new Map<string, string>();
    authUsers.forEach((u) => {
      if (u.email) emailMap.set(u.id, u.email);
    });

    const membersWithEmail = members.map((m) => ({
      ...m,
      email: emailMap.get(m.user_id) || '알 수 없음(삭제된 유저)',
    }));

    // 4. Fetch pending invites (accepted = false)
    const { data: invites, error: invitesErr } = await adminSupabase
      .from('store_invites')
      .select('*')
      .eq('store_id', store.id)
      .eq('accepted', false);

    if (invitesErr) {
      return NextResponse.json({ error: invitesErr.message }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        storeName: store.name,
        members: membersWithEmail,
        invites,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
