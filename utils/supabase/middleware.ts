import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
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
            request: {
              headers: request.headers,
            },
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
            request: {
              headers: request.headers,
            },
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
  const isAdmin = !!user?.email && user.email === process.env.ADMIN_EMAIL
  
  // 1. 비로그인 사용자 처리
  if (!user) {
    // 루트(/), 로그인(/login), 콜백 경로, 결제(/payment) 및 정적 미디어 파일들은 무인증 통과 허용
    const isStaticAsset = request.nextUrl.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|mp4|ico|txt)$/)
    const isPaymentPage = request.nextUrl.pathname.startsWith('/payment')
    if (!isRootPage && !isAuthPage && !isStaticAsset && !isPaymentPage && !request.nextUrl.pathname.startsWith('/auth/callback')) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
  }

  // 2. 로그인 사용자 처리
  if (user) {
    // Check if store exists
    const { data: store } = await supabase
      .from('stores')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    // 2-A. 스토어가 없는 사용자 -> 온보딩으로 강제 유도
    if (!store) {
      if (!isOnboardingPage && !request.nextUrl.pathname.startsWith('/auth/callback') && !request.nextUrl.pathname.startsWith('/api/')) {
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
        request.nextUrl.pathname.startsWith('/api/')

      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()

      if (!subscription) {
        // 2-B-1. 구독이 없는 사용자 -> 결제 페이지로 강제 유도
        if (!isPaymentPage && !isExemptPath) {
          const url = request.nextUrl.clone()
          url.pathname = '/payment'
          return NextResponse.redirect(url)
        }
      } else {
        // 2-B-2. 구독이 있는 사용자 -> 루트, 로그인, 온보딩, 결제 접속 시 대시보드로 리디렉션
        if (isRootPage || isAuthPage || isOnboardingPage || isPaymentPage) {
          const url = request.nextUrl.clone()
          url.pathname = '/dashboard'
          return NextResponse.redirect(url)
        }
      }
    }
  }

  return supabaseResponse
}
