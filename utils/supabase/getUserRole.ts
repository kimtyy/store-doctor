import { createClient as createServerClient } from './server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export type UserRole = 'owner' | 'manager' | 'staff'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createAdminClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

/**
 * 현재 로그인 사용자의 store 내 역할을 조회한다.
 * store_members 테이블에서 user_id 기준으로 role을 반환한다.
 * RLS 문제를 방지하기 위해 서비스 롤(Admin) 클라이언트를 사용하여 안전하게 조회한다.
 * - null: 미로그인 또는 store_members에 행 없음 → 접근 권한 없음
 */
export async function getUserRole(): Promise<UserRole | null> {
  const normalSupabase = createServerClient()

  const {
    data: { user },
  } = await normalSupabase.auth.getUser()
  
  console.log('[getUserRole] User from auth.getUser():', user ? { id: user.id, email: user.email } : null)
  if (!user) return null

  const adminSupabase = getAdminClient()
  if (!adminSupabase) {
    console.error('[getUserRole] Admin client creation failed (env variables missing)')
    return null
  }

  // 1) stores.owner_id 기준으로 실제 소유주인지 먼저 확인
  const { data: ownedStore } = await adminSupabase
    .from('stores')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (ownedStore) return 'owner'

  // 2) store_members에서 user_id로 조회 (manager/staff)
  const { data: member, error: memberError } = await adminSupabase
    .from('store_members')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  console.log('[getUserRole] store_members admin query result:', { 
    user_id: user.id, 
    member, 
    error: memberError 
  })

  return (member?.role as UserRole) ?? null
}
