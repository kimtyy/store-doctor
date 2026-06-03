import { submitStore } from './actions'

export default function OnboardingPage({ searchParams }: { searchParams: { message?: string } }) {
  return (
    <div className="flex-1 flex flex-col w-full px-8 sm:max-w-xl justify-center min-h-screen mx-auto py-10 text-slate-800">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">환영합니다!</h1>
        <p className="text-slate-500 mt-2">AI 매장 진단을 시작하기 전, 매장 정보를 입력해주세요.</p>
      </div>

      {searchParams?.message && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 text-center rounded-lg text-sm font-medium">
          {searchParams.message}
        </div>
      )}

      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 mb-8">
        <form action={submitStore} className="flex flex-col gap-5">
          <div>
            <label className="block text-sm font-semibold mb-1" htmlFor="name">매장명 <span className="text-rose-500">*</span></label>
            <input
              id="name"
              name="name"
              required
              className="w-full rounded-md px-4 py-2 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="예: 설맥 현리점"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1" htmlFor="category">업종 <span className="text-rose-500">*</span></label>
            <select
              id="category"
              name="category"
              required
              className="w-full rounded-md px-4 py-2 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">업종 선택</option>
              <option value="F&B">F&B (일반 음식점, 주점 등)</option>
              <option value="Cafe">카페/베이커리</option>
              <option value="Convenience">편의점/마트</option>
              <option value="Other">기타 서비스업</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1" htmlFor="region">지역 <span className="text-rose-500">*</span></label>
            <input
              id="region"
              name="region"
              required
              className="w-full rounded-md px-4 py-2 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="예: 서울 강남구"
            />
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100">
            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-3.5 font-bold text-lg transition shadow-md"
            >
              매장 등록 완료하기
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5">
          <h3 className="font-bold text-indigo-900 mb-2 flex items-center gap-2">
            <span>💡</span> 데이터 입력 안내
          </h3>
          <p className="text-sm text-indigo-800 leading-relaxed">
            매장 등록 후, <strong>[매출 입력]</strong> 및 <strong>[매입 입력]</strong> 메뉴를 통해 일일 영수증이나 장부 내용을 사진으로 찍거나 수기로 입력해주세요. 데이터가 쌓일수록 AI 진단의 정확도가 높아집니다.
          </p>
        </div>

        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5">
          <h3 className="font-bold text-emerald-900 mb-2 flex items-center gap-2">
            <span>🎁</span> 베타 테스터 특별 혜택
          </h3>
          <p className="text-sm text-emerald-800 leading-relaxed">
            초대 코드로 가입하신 베타 테스터 분들께는 <strong className="text-emerald-900 bg-emerald-200 px-1 rounded">처음 30일 무료</strong> 혜택이 제공됩니다! 지금 바로 모든 AI 분석 기능을 무제한으로 체험해 보세요.
          </p>
        </div>
      </div>
    </div>
  )
}
