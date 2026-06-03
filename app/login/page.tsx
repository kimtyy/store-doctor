import { login, signup } from './actions'

export default function LoginPage({
  searchParams,
}: {
  searchParams: { message: string }
}) {
  return (
    <div className="flex-1 flex flex-col w-full px-8 sm:max-w-md justify-center gap-2 min-h-screen mx-auto py-10 text-slate-800">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Store Doctor</h1>
        <p className="text-slate-500 mt-2">당신의 매장을 위한 똑똑한 AI 솔루션</p>
      </div>

      <form className="animate-in flex-1 flex flex-col w-full justify-center gap-2 text-foreground">
        <label className="text-md font-semibold" htmlFor="email">
          이메일
        </label>
        <input
          id="email"
          className="rounded-md px-4 py-2 bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-6"
          name="email"
          placeholder="you@example.com"
          required
        />
        <label className="text-md font-semibold" htmlFor="password">
          비밀번호
        </label>
        <input
          id="password"
          className="rounded-md px-4 py-2 bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-6"
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

        <div className="flex flex-col gap-3 mt-4">
          <button
            formAction={login}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-md px-4 py-3 font-semibold transition"
          >
            로그인
          </button>
          <button
            formAction={signup}
            className="border border-indigo-600 text-indigo-600 hover:bg-indigo-50 rounded-md px-4 py-3 font-semibold transition"
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
