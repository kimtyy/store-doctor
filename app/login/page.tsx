'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { login, signup } from './actions'

export default function LoginPage({
  searchParams,
}: {
  searchParams: { message?: string; redirect?: string }
}) {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleGoogleLogin = async () => {
    setLoading(true)
    const nextPath = searchParams?.redirect || '/onboarding'
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    })
    if (error) {
      alert(error.message)
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col w-full px-8 sm:max-w-md justify-center gap-2 min-h-screen mx-auto py-10 text-slate-800">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">매장닥터</h1>
        <p className="text-slate-500 mt-2">당신의 매장을 위한 똑똑한 AI 솔루션</p>
      </div>

      <div className="w-full">
        {/* Google OAuth Login Button */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-md px-4 py-3 font-semibold transition shadow-sm mb-6 disabled:opacity-50 cursor-pointer"
        >
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Google로 시작하기
        </button>

        <div className="relative flex items-center justify-center my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <span className="relative px-3 bg-slate-50 text-xs text-slate-500 font-semibold">
            또는 이메일로 로그인
          </span>
        </div>
      </div>

      <form className="animate-in flex-1 flex flex-col w-full justify-center gap-2 text-foreground">
        <input type="hidden" name="redirect_to" value={searchParams?.redirect || ''} />
        <label className="text-md font-semibold" htmlFor="email">
          이메일
        </label>
        <input
          id="email"
          className="rounded-md px-4 py-2 bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
          name="email"
          placeholder="you@example.com"
          required
        />
        <label className="text-md font-semibold" htmlFor="password">
          비밀번호
        </label>
        <input
          id="password"
          className="rounded-md px-4 py-2 bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
          type="password"
          name="password"
          placeholder="••••••••"
          required
        />
        
        <label className="text-md font-semibold" htmlFor="invite_code">
          초대 코드 <span className="text-sm font-normal text-slate-500">(회원가입 시 필수)</span>
        </label>
        <input
          id="invite_code"
          className="rounded-md px-4 py-2 bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-6"
          name="invite_code"
          placeholder="BETA1"
        />

        <div className="flex flex-col gap-3 mt-2">
          <button
            formAction={login}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-md px-4 py-3 font-semibold transition cursor-pointer"
          >
            로그인
          </button>
          <button
            formAction={signup}
            className="border border-indigo-600 text-indigo-600 hover:bg-indigo-50 rounded-md px-4 py-3 font-semibold transition cursor-pointer"
          >
            초대 코드로 회원가입
          </button>
        </div>

        {searchParams?.message && (
          <p className="mt-4 p-4 bg-rose-50 border border-rose-200 text-rose-700 text-center rounded-lg text-sm font-medium">
            {searchParams.message}
          </p>
        )}
      </form>
    </div>
  )
}
