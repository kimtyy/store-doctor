import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/'

  console.log(`[Auth Callback] GET request received. Code present: ${!!code}, Next redirect: ${next}`)

  if (code) {
    const supabase = createClient()
    try {
      console.log('[Auth Callback] Exchanging code for session...')
      await supabase.auth.exchangeCodeForSession(code)
      console.log('[Auth Callback] Code exchange completed successfully.')
    } catch (err) {
      console.error('[Auth Callback] Code exchange failed:', err)
    }

    // Check and process invitation auto-matching
    try {
      const { data: { user } } = await supabase.auth.getUser()
      console.log('[Auth Callback] Retrieved user from getUser():', user ? { id: user.id, email: user.email } : 'NULL')

      let emailToMatch = user?.email
      let userIdToMatch = user?.id

      if (!user) {
        console.log('[Auth Callback] user is null, checking getSession() fallback...')
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          console.log('[Auth Callback] User retrieved from session fallback:', { id: session.user.id, email: session.user.email })
          emailToMatch = session.user.email
          userIdToMatch = session.user.id
        } else {
          console.log('[Auth Callback] Session is also null or has no user.')
        }
      }

      if (emailToMatch && userIdToMatch) {
        const trimmedEmail = emailToMatch.trim().toLowerCase()
        console.log(`[Auth Callback] Attempting to find pending invite. Query email (trimmed/lowercase): "${trimmedEmail}"`)

        const adminSupabase = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } }
        )

        // DB 전체 대기 중인 초대장 리스트를 로그로 출력해 대소문자/공백 차이를 대조해봄
        const { data: allPendingInvites } = await adminSupabase
          .from('store_invites')
          .select('id, email, role, accepted')
          .eq('accepted', false)
        console.log('[Auth Callback] Current database pending invites:', allPendingInvites)

        // ilike 혹은 대소문자 일치 검색 수행
        const { data: invite, error: inviteErr } = await adminSupabase
          .from('store_invites')
          .select('*')
          .eq('email', trimmedEmail)
          .eq('accepted', false)
          .maybeSingle()

        console.log('[Auth Callback] store_invites query result:', { invite, error: inviteErr })

        if (invite && !inviteErr) {
          console.log(`[Auth Callback] Matching invite found! Store: ${invite.store_id}, Role: ${invite.role}. Inserting into store_members...`)
          const { error: insertErr } = await adminSupabase
            .from('store_members')
            .insert({
              store_id: invite.store_id,
              user_id: userIdToMatch,
              role: invite.role,
              invited_by: invite.invited_by
            })

          if (!insertErr) {
            console.log(`[Auth Callback] Successfully inserted member: ${userIdToMatch}. Updating invite accepted = true...`)
            const { error: updateErr } = await adminSupabase
              .from('store_invites')
              .update({ accepted: true })
              .eq('id', invite.id)
            if (updateErr) {
              console.error('[Auth Callback] Failed to update invite accepted state:', updateErr.message)
            } else {
              console.log(`[Auth Callback] Auto matching completed successfully for: ${trimmedEmail}`)
            }
          } else {
            console.error('[Auth Callback] store_members insert failed:', insertErr.message)
          }
        } else {
          console.log('[Auth Callback] No matching pending invite found in DB.')
        }
      }
    } catch (err) {
      console.error('[Auth Callback] Invite auto matching failed:', err)
    }
  }

  // URL origin redirection for security and proper routing
  return NextResponse.redirect(new URL(next, requestUrl.origin))
}
