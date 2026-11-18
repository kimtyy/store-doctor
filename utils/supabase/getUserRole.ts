import { createClient as createServerClient } from './server';
import { getMemberAccess } from './getStore';

export type UserRole = 'owner' | 'manager' | 'staff' | 'suspended';

/**
 * 현재 로그인 사용자의 store 내 역할을 조회한다.
 * - 소유자: 'owner'
 * - 정상 멤버: 'manager' | 'staff'
 * - 플랜 인원 초과로 일시 정지된 구성원: 'suspended'
 * - 미로그인 또는 소속 없음: null
 */
export async function getUserRole(): Promise<UserRole | null> {
  const normalSupabase = createServerClient();
  const {
    data: { user },
  } = await normalSupabase.auth.getUser();

  if (!user) return null;

  if (process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL) {
    return 'owner';
  }

  const accessResult = await getMemberAccess(user.id);
  if (accessResult.access === 'suspended') {
    return 'suspended';
  }
  return accessResult.role;
}
