import { createClient } from './server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createAdminClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

export async function getStoreId(): Promise<string | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // 1. Check if user is owner of a store
  const { data: store } = await supabase
    .from('stores')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()
    
  if (store) return store.id

  // 2. Fallback to check if user is a member of a store (using admin client to bypass RLS)
  const adminSupabase = getAdminClient()
  if (!adminSupabase) return null

  const { data: member } = await adminSupabase
    .from('store_members')
    .select('store_id')
    .eq('user_id', user.id)
    .maybeSingle()

  return member?.store_id || null
}

export async function getStoreInfo() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // 1. Check if user is owner of a store
  const { data: store } = await supabase
    .from('stores')
    .select('id, name, category, region')
    .eq('owner_id', user.id)
    .maybeSingle()
    
  if (store) return store

  // 2. Fallback to check if user is a member of a store
  const adminSupabase = getAdminClient()
  if (!adminSupabase) return null

  const { data: member } = await adminSupabase
    .from('store_members')
    .select('store_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (member?.store_id) {
    const { data: storeData } = await adminSupabase
      .from('stores')
      .select('id, name, category, region')
      .eq('id', member.store_id)
      .maybeSingle()
    return storeData || null
  }

  return null
}
