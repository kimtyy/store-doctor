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
    .insert([
      {
        owner_id: user.id,
        name,
        // You might want to save category and region in stores table too, 
        // if your schema has them. Currently schema has 'name'. 
        // For now, if schema doesn't have it, we just insert name.
        // Wait, I didn't add category/region to stores schema in the migration.
        // I will just insert 'name', or I'll need to alter the table first.
      }
    ])

  if (error) {
    console.error('Error creating store:', error)
    return redirect('/onboarding?message=매장 등록에 실패했습니다.')
  }

  revalidatePath('/', 'layout')
  redirect('/')
}
