'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function submitStore(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return redirect('/login')
  }

  const name = formData.get('name') as string
  const category = formData.get('category') as string
  const region = formData.get('region') as string

  // 중복 생성 방지: 이미 owner_id 에 매핑된 매장이 존재하는지 사전 체크
  const { data: existingStore } = await supabase
    .from('stores')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (existingStore) {
    return redirect('/payment')
  }

  // Insert store (using owner_id only as the single unified criteria)
  const { data: newStore, error } = await supabase
    .from('stores')
    .insert([{ owner_id: user.id, name, category, region }])
    .select('id')
    .single()

  if (error || !newStore) {
    console.error('Error creating store:', error)
    return redirect('/onboarding?message=매장 등록에 실패했습니다.')
  }

  // 온보딩 시 store_members에 owner 자동 등록
  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { error: memberError } = await adminSupabase
    .from('store_members')
    .insert({
      store_id: newStore.id,
      user_id: user.id,
      role: 'owner',
    })

  if (memberError) {
    console.error('Error adding store owner to store_members:', memberError)
  }

  revalidatePath('/', 'layout')
  redirect('/payment')
}

