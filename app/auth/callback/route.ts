import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/'

  if (code) {
    const supabase = createClient()
    await supabase.auth.exchangeCodeForSession(code)

    // Check and process invitation auto-matching
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user && user.email) {
        const adminSupabase = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } }
        )

        const { data: invite, error: inviteErr } = await adminSupabase
          .from('store_invites')
          .select('*')
          .eq('email', user.email)
          .eq('accepted', false)
          .maybeSingle()

        if (invite && !inviteErr) {
          const { error: insertErr } = await adminSupabase
            .from('store_members')
            .insert({
              store_id: invite.store_id,
              user_id: user.id,
              role: invite.role,
              invited_by: invite.invited_by
            })

          if (!insertErr) {
            await adminSupabase
              .from('store_invites')
              .update({ accepted: true })
              .eq('id', invite.id)
            console.log(`[auth callback] Automatically mapped invited user: ${user.email} to store: ${invite.store_id}`)
          } else {
            console.error('[auth callback] store_members insert failed:', insertErr.message)
          }
        }
      }
    } catch (err) {
      console.error('[auth callback] Invite auto matching failed:', err)
    }
  }

  // URL origin redirection for security and proper routing
  return NextResponse.redirect(new URL(next, requestUrl.origin))
}
