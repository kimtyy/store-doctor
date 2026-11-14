import { NextResponse } from 'next/server'
import { getUserRole } from '@/utils/supabase/getUserRole'
import { getStoreId } from '@/utils/supabase/getStore'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const role = await getUserRole()
    const storeId = await getStoreId()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const isAdmin = !!user?.email && user.email === process.env.ADMIN_EMAIL
    return NextResponse.json({ role, userId: user?.id ?? null, storeId, isAdmin })
  } catch {
    return NextResponse.json({ role: null, userId: null, storeId: null, isAdmin: false })
  }
}
