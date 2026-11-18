'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function SuspendedChecker() {
  const pathname = usePathname();
  const [suspendedMessage, setSuspendedMessage] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    // 공개 페이지나 로그인/온보딩 페이지는 검사 생략
    if (
      pathname === '/' ||
      pathname === '/login' ||
      pathname === '/terms' ||
      pathname === '/privacy' ||
      pathname.startsWith('/auth')
    ) {
      setSuspendedMessage(null);
      return;
    }

    fetch('/api/me/role')
      .then((res) => res.json())
      .then((data) => {
        if (data.role === 'suspended') {
          setSuspendedMessage(
            data.message ||
              '매장 플랜이 변경되어 직원 계정 접근이 일시 중지되었습니다. 대표에게 문의해 주세요.'
          );
        } else {
          setSuspendedMessage(null);
        }
      })
      .catch(() => {});
  }, [pathname]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
      window.location.href = '/login';
    } catch {
      window.location.href = '/login';
    }
  };

  if (!suspendedMessage) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-3xl border border-amber-500/30 bg-slate-900 p-6 sm:p-8 text-center space-y-5 shadow-2xl">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-3xl">
          🔒
        </div>
        <div className="space-y-2">
          <h2 className="text-lg sm:text-xl font-bold text-slate-100">
            접근이 일시 중지되었습니다
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            {suspendedMessage}
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 text-left space-y-1.5">
          <p className="font-semibold text-slate-300">💡 안내 사항</p>
          <p>• 매장 데이터 및 계정 정보는 안전하게 보존되어 있습니다.</p>
          <p>• 대표 계정이 <strong>Premium 플랜</strong>으로 업그레이드하면 다시 정상 이용하실 수 있습니다.</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full py-3.5 rounded-2xl bg-slate-800 border border-slate-700 text-slate-200 text-sm font-semibold hover:bg-slate-700 transition cursor-pointer"
        >
          {loggingOut ? '로그아웃 중...' : '로그아웃'}
        </button>
      </div>
    </div>
  );
}

