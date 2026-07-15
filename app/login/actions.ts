'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// redirect_to는 로그인 페이지의 searchParams.redirect를 그대로 hidden input에
// 옮겨 담은 값이라 보통은 이미 디코딩된 상태지만, 혹시 인코딩된 채로 들어오면
// redirect()가 만드는 x-action-redirect 헤더에 그대로 실려 헤더 검증에서
// 깨질 수 있어 한 번 더 디코딩해 정규화한다. 동시에 내부 상대 경로만
// 허용해(오픈 리다이렉트 방지) 외부 URL로는 리다이렉트되지 않게 한다.
function normalizeRedirectTo(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string' || !value) return '/onboarding'

  let decoded = value
  try {
    decoded = decodeURIComponent(value)
  } catch {
    return '/onboarding'
  }

  if (!decoded.startsWith('/') || decoded.startsWith('//')) return '/onboarding'
  return decoded
}

export async function login(formData: FormData) {
  const supabase = createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const redirectTo = normalizeRedirectTo(formData.get('redirect_to'))

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    // 한글 등 non-ASCII 문자를 인코딩하지 않고 redirect()에 넘기면
    // x-action-redirect 헤더에 그대로 실리면서 Node가 ERR_INVALID_CHAR로
    // 거부해 500이 발생한다. 메시지도 반드시 encodeURIComponent로 감싼다.
    const message = encodeURIComponent('로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.')
    const failUrl = `/login?message=${message}${
      redirectTo ? `&redirect=${encodeURIComponent(redirectTo)}` : ''
    }`
    return redirect(failUrl)
  }

  revalidatePath('/', 'layout')
  redirect(redirectTo)
}

export async function signout() {
  const supabase = createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
