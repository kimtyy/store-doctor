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

export async function signup(formData: FormData) {
  const supabase = createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const inviteCode = (formData.get('invite_code') as string)?.trim().toUpperCase()
  const redirectTo = (formData.get('redirect_to') as string) || '/onboarding'

  if (!inviteCode) {
    const failUrl = `/login?message=초대 코드가 필요합니다.${
      redirectTo ? `&redirect=${encodeURIComponent(redirectTo)}` : ''
    }`
    return redirect(failUrl)
  }

  // Verify invite code
  const { data: codeData, error: codeError } = await supabase
    .from('invite_codes')
    .select('*')
    .eq('code', inviteCode)
    .eq('is_used', false)
    .single()

  if (codeError || !codeData) {
    const failUrl = `/login?message=유효하지 않거나 이미 사용된 초대 코드입니다.${
      redirectTo ? `&redirect=${encodeURIComponent(redirectTo)}` : ''
    }`
    return redirect(failUrl)
  }

  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  })

  if (signUpError) {
    const failUrl = `/login?message=회원가입에 실패했습니다. (이미 가입된 이메일이거나 오류)${
      redirectTo ? `&redirect=${encodeURIComponent(redirectTo)}` : ''
    }`
    return redirect(failUrl)
  }

  // Mark invite code as used
  if (authData.user) {
    await supabase
      .from('invite_codes')
      .update({ is_used: true, used_by: authData.user.id })
      .eq('code', inviteCode)
  }

  // Check if email confirmation is required (session is null)
  if (!authData.session) {
    const failUrl = `/login?message=회원가입 성공! 이메일을 확인하여 인증을 완료해주세요.${
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
