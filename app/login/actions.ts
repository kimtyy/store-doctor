'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const supabase = createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return redirect('/login?message=로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.')
  }

  revalidatePath('/', 'layout')
  redirect('/onboarding') // middleware will redirect to / if store exists
}

export async function signup(formData: FormData) {
  const supabase = createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const inviteCode = formData.get('invite_code') as string

  if (!inviteCode) {
    return redirect('/login?message=초대 코드가 필요합니다.')
  }

  // Verify invite code
  const { data: codeData, error: codeError } = await supabase
    .from('invite_codes')
    .select('*')
    .eq('code', inviteCode)
    .eq('is_used', false)
    .single()

  if (codeError || !codeData) {
    return redirect('/login?message=유효하지 않거나 이미 사용된 초대 코드입니다.')
  }

  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  })

  if (signUpError) {
    return redirect('/login?message=회원가입에 실패했습니다. (이미 가입된 이메일이거나 오류)')
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
    return redirect('/login?message=회원가입 성공! 이메일을 확인하여 인증을 완료해주세요.')
  }

  revalidatePath('/', 'layout')
  redirect('/onboarding')
}

export async function signout() {
  const supabase = createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
