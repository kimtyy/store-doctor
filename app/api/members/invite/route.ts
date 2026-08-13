import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getUserRole } from '@/utils/supabase/getUserRole';

// POST /api/members/invite
export async function POST(request: Request) {
  const roleCheck = await getUserRole();
  if (roleCheck !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { email, role } = await request.json();
    if (!email || !role) {
      return NextResponse.json({ error: '이메일과 역할을 지정해야 합니다.' }, { status: 400 });
    }

    if (!['manager', 'staff'].includes(role)) {
      return NextResponse.json({ error: '올바르지 않은 역할입니다.' }, { status: 400 });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // 1. Get the store owned by the owner
    const { data: store, error: storeErr } = await supabase
      .from('stores')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle();

    if (storeErr || !store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const adminSupabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 2. Check if already invited (accepted = false in store_invites)
    const { data: existingInvite, error: inviteCheckErr } = await adminSupabase
      .from('store_invites')
      .select('id')
      .eq('store_id', store.id)
      .eq('email', trimmedEmail)
      .eq('accepted', false)
      .maybeSingle();

    if (inviteCheckErr) {
      return NextResponse.json({ error: inviteCheckErr.message }, { status: 500 });
    }

    if (existingInvite) {
      return NextResponse.json({ error: '이미 멤버이거나 초대된 이메일입니다' }, { status: 400 });
    }

    // 3. Check if already a member in store_members (we map via auth email list)
    const { data: { users: authUsers }, error: authUsersErr } = await adminSupabase.auth.admin.listUsers();
    if (authUsersErr) {
      return NextResponse.json({ error: 'Failed to check existing members' }, { status: 500 });
    }

    const matchedUser = authUsers.find((u) => u.email?.trim().toLowerCase() === trimmedEmail);
    if (matchedUser) {
      const { data: existingMember, error: memberCheckErr } = await adminSupabase
        .from('store_members')
        .select('id')
        .eq('store_id', store.id)
        .eq('user_id', matchedUser.id)
        .maybeSingle();

      if (memberCheckErr) {
        return NextResponse.json({ error: memberCheckErr.message }, { status: 500 });
      }

      if (existingMember) {
        return NextResponse.json({ error: '이미 멤버이거나 초대된 이메일입니다' }, { status: 400 });
      }
    }

    // 4. Create new invitation
    const { error: insertErr } = await adminSupabase
      .from('store_invites')
      .insert({
        store_id: store.id,
        email: trimmedEmail,
        role,
        invited_by: user.id,
        accepted: false,
      });

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '초대가 성공적으로 발송되었습니다.' });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
