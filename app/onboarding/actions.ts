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

  // Insert store
  const { error } = await supabase
    .from('stores')
    .insert([{ owner_id: user.id, name, category, region }])     

  if (error) {
    console.error('Error creating store:', error)
    return redirect('/onboarding?message=매장 등록에 실패했습니다.')
  }

  revalidatePath('/', 'layout')
  redirect('/')
}
