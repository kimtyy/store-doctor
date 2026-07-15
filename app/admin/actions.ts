'use server';

import { createClient as createServerClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

async function checkAdmin() {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    throw new Error('Unauthorized');
  }
}

export async function deleteStore(storeId: string, ownerId: string | null) {
  await checkAdmin();
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  if (ownerId) {
    // 유저 계정을 삭제하면 ON DELETE CASCADE 에 의해 stores 테이블의 레코드도 함께 삭제됨
    const { error } = await adminClient.auth.admin.deleteUser(ownerId);
    if (error) {
      console.error('Delete user error:', error);
      throw new Error('유저 삭제 중 오류가 발생했습니다.');
    }
  } else {
    // owner_id가 없는 더미 데이터의 경우 매장만 삭제
    const { error } = await adminClient.from('stores').delete().eq('id', storeId);
    if (error) {
      console.error('Delete store error:', error);
      throw new Error('매장 삭제 중 오류가 발생했습니다.');
    }
  }

  revalidatePath('/admin');
  return { success: true };
}

export async function deleteInviteCode(code: string) {
  await checkAdmin();
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await adminClient.from('invite_codes').delete().eq('code', code);
  if (error) {
    console.error('Delete invite code error:', error);
    throw new Error('초대 코드 삭제 중 오류가 발생했습니다.');
  }

  revalidatePath('/admin');
  return { success: true };
}
