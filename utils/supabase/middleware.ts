import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          supabaseResponse = NextResponse.next({
            request,
          })
          supabaseResponse.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          supabaseResponse = NextResponse.next({
            request,
          })
          supabaseResponse.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isRootPage = request.nextUrl.pathname === '/'
  const isAuthPage = request.nextUrl.pathname.startsWith('/login')
  const isOnboardingPage = request.nextUrl.pathname.startsWith('/onboarding')
  const isTermsPage = request.nextUrl.pathname.startsWith('/terms')
  const isPrivacyPage = request.nextUrl.pathname.startsWith('/privacy')
  const isAdmin = !!user?.email && user.email === process.env.ADMIN_EMAIL
  
  // 1. 비로그인 사용자 처리
  if (!user) {
    // 루트(/), 로그인(/login), 약관(/terms), 개인정보(/privacy), 콜백 경로, 결제(/payment) 및 정적 미디어 파일들은 무인증 통과 허용
    const isStaticAsset = request.nextUrl.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|mp4|ico|txt)$/)
    const isPaymentPage = request.nextUrl.pathname.startsWith('/payment')
    if (!isRootPage && !isAuthPage && !isStaticAsset && !isPaymentPage && !isTermsPage && !isPrivacyPage && !request.nextUrl.pathname.startsWith('/auth/callback')) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
  }

  // 2. 로그인 사용자 처리
  if (user) {
    // 1) 본인이 소유한 스토어 조회
    const { data: ownedStore } = await supabase
      .from('stores')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle()

    // 2) 본인이 멤버로 소속된 스토어 조회 (RLS 우회를 위한 adminClient 활용)
    const adminClient = (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
      ? createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          { auth: { autoRefreshToken: false, persistSession: false } }
        )
      : supabase

    const { data: memberStore } = await adminClient
      .from('store_members')
      .select('store_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const hasStore = !!ownedStore || !!memberStore

    // 2-A. 스토어가 없는 사용자 -> 온보딩으로 강제 유도 (단, 관리자는 스킵, 루트/약관/개인정보는 허용)
    if (!hasStore && !isAdmin) {
      if (!isRootPage && !isTermsPage && !isPrivacyPage && !isOnboardingPage && !request.nextUrl.pathname.startsWith('/auth/callback') && !request.nextUrl.pathname.startsWith('/api/')) {
        const url = request.nextUrl.clone()
        url.pathname = '/onboarding'
        return NextResponse.redirect(url)
      }
    }
    // 2-B. 스토어가 이미 존재하는 사용자 -> 구독 상태를 확인해 결제/대시보드로 유도
    // (관리자 계정은 구독 체크 자체를 건너뛰고 모든 페이지에 자유롭게 접근)
    else if (!isAdmin) {
      const isPaymentPage = request.nextUrl.pathname.startsWith('/payment')
      const isExemptPath =
        request.nextUrl.pathname.startsWith('/auth/callback') ||
        request.nextUrl.pathname.startsWith('/api/') ||
        isTermsPage ||
        isPrivacyPage

      // 구독을 조회할 타겟 user_id (본인이 스태프인 경우 스토어 Owner의 user_id로 조회)
      let targetUserIdForSub = user.id
      if (!ownedStore && memberStore) {
        const { data: storeInfo } = await adminClient
          .from('stores')
          .select('owner_id')
          .eq('id', memberStore.store_id)
          .maybeSingle()
        if (storeInfo?.owner_id) {
          targetUserIdForSub = storeInfo.owner_id
          console.log(`[Middleware] Staff/Manager login. Target subscription owner_id: ${targetUserIdForSub}`)
        } else {
          console.warn(`[Middleware] Staff/Manager login but failed to find owner_id for store: ${memberStore.store_id}`)
        }
      }

      // subscriptions 조회 자체가 실패하더라도(테이블/RLS 미비 등) 미들웨어가
      // 통째로 죽지 않도록 방어한다. 조회 실패 시 "구독 없음"으로 간주해
      // 결제 페이지로 보내되, 전체 요청이 500으로 죽는 것은 막는다.
      let subscription: { id: string } | null = null
      try {
        const { data, error } = await adminClient
          .from('subscriptions')
          .select('id')
          .eq('user_id', targetUserIdForSub)
          .eq('status', 'active')
          .gt('expires_at', new Date().toISOString())
          .maybeSingle()

        if (error) {
          console.error('subscriptions 조회 실패:', error.message)
        } else {
          console.log(`[Middleware] Subscription check for user ${targetUserIdForSub}: ${data ? 'ACTIVE' : 'INACTIVE'}`)
        }
        subscription = data
      } catch (err) {
        console.error('subscriptions 조회 중 예외 발생:', err)
      }

      if (!subscription) {
        // 2-B-1. 구독이 없는 사용자 -> 결제 페이지로 강제 유도 (루트/약관/개인정보는 허용)
        if (!isRootPage && !isPaymentPage && !isExemptPath) {
          const url = request.nextUrl.clone()
          url.pathname = '/payment'
          return NextResponse.redirect(url)
        }
      } else {
        // 2-B-2. 구독이 있는 사용자 -> 로그인, 온보딩, 결제 접속 시 대시보드로 리디렉션 (루트/약관/개인정보는 허용)
        if (isAuthPage || isOnboardingPage || isPaymentPage) {
          const url = request.nextUrl.clone()
          url.pathname = '/dashboard'
          return NextResponse.redirect(url)
        }
      }
    } else {
      // 2-C. 관리자(isAdmin) 계정 -> 로그인, 온보딩, 결제 접속 시 바로 대시보드로 리디렉션 (루트/약관/개인정보는 허용)
      if (isAuthPage || isOnboardingPage || request.nextUrl.pathname.startsWith('/payment')) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}
