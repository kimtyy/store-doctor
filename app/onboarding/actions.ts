'use server'

import { createClient } from '@/utils/supabase/server'
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
  const { error } = await supabase
    .from('stores')
    .insert([{ owner_id: user.id, name, category, region }])     

  if (error) {
    console.error('Error creating store:', error)
    return redirect('/onboarding?message=매장 등록에 실패했습니다.')
  }

  revalidatePath('/', 'layout')
  redirect('/payment')
}
