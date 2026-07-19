import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between py-12 px-6">
      <div className="max-w-xl mx-auto w-full my-auto text-center space-y-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-100">개인정보처리방침</h1>
        <p className="text-slate-400 text-base leading-relaxed">
          개인정보처리방침 서비스 준비 중입니다. 내용이 준비되는 대로 업데이트될 예정입니다.
        </p>
        <div className="pt-4">
          <Link
            href="/"
            className="inline-block bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl px-6 py-3 font-semibold transition"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
      <div className="text-center text-xs text-slate-600 mt-8">
        © 2026 허브스마트. All rights reserved.
      </div>
    </div>
  );
}
