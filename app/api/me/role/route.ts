import { NextResponse } from 'next/server'
import { getUserRole } from '@/utils/supabase/getUserRole'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const role = await getUserRole()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return NextResponse.json({ role, userId: user?.id ?? null })
  } catch {
    return NextResponse.json({ role: null, userId: null })
  }
}
