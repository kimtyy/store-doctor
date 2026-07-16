import { createClient } from './server'

export async function getStoreId() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: store } = await supabase
    .from('stores')
    .select('id')
    .eq('owner_id', user.id)
    .single()
    
  return store?.id || null
}

export async function getStoreInfo() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: store } = await supabase
    .from('stores')
    .select('id, name, category, region')
    .eq('owner_id', user.id)
    .single()
    
  return store || null
}
