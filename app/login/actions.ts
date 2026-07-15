'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const supabase = createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const redirectTo = (formData.get('redirect_to') as string) || '/onboarding'

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    const failUrl = `/login?message=로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.${
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
