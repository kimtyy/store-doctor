import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getUserRole } from '@/utils/supabase/getUserRole';

// DELETE /api/members/[id]
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const roleCheck = await getUserRole();
  if (roleCheck !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const deleteId = params.id;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type'); // 'member' or 'invite'

  if (!deleteId || !type) {
    return NextResponse.json({ error: 'ID and type parameters are required' }, { status: 400 });
  }

  try {
    // 1. Get owner's store
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

    if (type === 'member') {
      // 2. Fetch the member row to ensure it belongs to owner's store and is not the owner themselves
      const { data: member, error: memberErr } = await adminSupabase
        .from('store_members')
        .select('*')
        .eq('id', deleteId)
        .maybeSingle();

      if (memberErr || !member) {
        return NextResponse.json({ error: 'Member not found' }, { status: 404 });
      }

      if (member.store_id !== store.id) {
        return NextResponse.json({ error: 'Forbidden: Member belongs to another store' }, { status: 403 });
      }

      if (member.user_id === user.id) {
        return NextResponse.json({ error: '자기 자신은 목록에서 삭제할 수 없습니다.' }, { status: 400 });
      }

      // Delete the member
      const { error: delErr } = await adminSupabase
        .from('store_members')
        .delete()
        .eq('id', deleteId);

      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: '멤버가 성공적으로 삭제되었습니다.' });
    } else if (type === 'invite') {
      // 3. Fetch the invite row to ensure it belongs to owner's store
      const { data: invite, error: inviteErr } = await adminSupabase
        .from('store_invites')
        .select('*')
        .eq('id', deleteId)
        .maybeSingle();

      if (inviteErr || !invite) {
        return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
      }

      if (invite.store_id !== store.id) {
        return NextResponse.json({ error: 'Forbidden: Invitation belongs to another store' }, { status: 403 });
      }

      // Delete the invite (cancel)
      const { error: delErr } = await adminSupabase
        .from('store_invites')
        .delete()
        .eq('id', deleteId);

      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: '초대가 성공적으로 취소되었습니다.' });
    } else {
      return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
