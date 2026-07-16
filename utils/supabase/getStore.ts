import { createClient } from './server'

export async function getStoreId() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // 1. 관리자 계정(kimtyy@gmail.com)은 설맥현리점 store_id 강제 고정 반환
  if (user.email === 'kimtyy@gmail.com') {
    return '8de2930d-a196-4aa1-b9bf-7fa83321b10c'
  }

  // 2. 신규 user_id 컬럼으로 조회
  let { data: store } = await supabase
    .from('stores')
    .select('id')
    .eq('user_id', user.id)
    .single()
    
  // 3. user_id 매칭 실패 시 레거시 owner_id 컬럼으로 폴백 조회
  if (!store) {
    const { data: fallbackStore } = await supabase
      .from('stores')
      .select('id')
      .eq('owner_id', user.id)
      .single()
    store = fallbackStore
  }
    
  return store?.id || null
}

export async function getStoreInfo() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // 1. 관리자 계정(kimtyy@gmail.com)은 설맥현리점 정보 강제 조회
  if (user.email === 'kimtyy@gmail.com') {
    const { data: store } = await supabase
      .from('stores')
      .select('id, name, category, region')
      .eq('id', '8de2930d-a196-4aa1-b9bf-7fa83321b10c')
      .single()
    return store || null
  }

  // 2. 신규 user_id 컬럼으로 조회
  let { data: store } = await supabase
    .from('stores')
    .select('id, name, category, region')
    .eq('user_id', user.id)
    .single()

  // 3. user_id 매칭 실패 시 레거시 owner_id 컬럼으로 폴백 조회
  if (!store) {
    const { data: fallbackStore } = await supabase
      .from('stores')
      .select('id, name, category, region')
      .eq('owner_id', user.id)
      .single()
    store = fallbackStore
  }
    
  return store || null
}
