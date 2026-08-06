import { createClient } from './server'

export type UserRole = 'owner' | 'manager' | 'staff'

/**
 * 현재 로그인 사용자의 store 내 역할을 조회한다.
 * store_members 테이블에서 user_id + store_id 기준으로 role을 반환한다.
 * - null: 미로그인 또는 store 없음 또는 store_members에 행 없음 → 접근 권한 없음
 */
export async function getUserRole(): Promise<UserRole | null> {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  
  console.log('[getUserRole] User from auth.getUser():', user ? { id: user.id, email: user.email } : null)
  if (!user) return null

  // 1. 해당 사용자의 store 조회 (owner_id 기준)
  const { data: store, error: storeError } = await supabase
    .from('stores')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  console.log('[getUserRole] Store query result:', { store, error: storeError })
  if (!store) return null

  // 2. store_members에서 role 조회
  const { data: member, error: memberError } = await supabase
    .from('store_members')
    .select('role')
    .eq('store_id', store.id)
    .eq('user_id', user.id)
    .single()

  console.log('[getUserRole] store_members query result:', { 
    store_id: store.id, 
    user_id: user.id, 
    member, 
    error: memberError 
  })

  return (member?.role as UserRole) ?? null
}
