'use client';

import { useState } from 'react';
import BottomTabNav from '../../components/BottomTabNav';

export default function SettingsPage() {
  const [deleteDate, setDeleteDate] = useState('');
  const [deletingDay, setDeletingDay] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleNormalize() {
    setNormalizing(true);
    setMessage(null);
    try {
      const res = await fetch('/api/normalize', { method: 'POST' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `서버 오류 (${res.status})`);
      setMessage({ type: 'success', text: body.message ?? '정규화 완료' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '정규화 실패' });
    } finally {
      setNormalizing(false);
    }
  }

  async function handleDeleteDay() {
    if (!deleteDate) return;
    setDeletingDay(true);
    setMessage(null);
    try {
      const res = await fetch('/api/data/delete-day', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: deleteDate }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `서버 오류 (${res.status})`);
      setMessage({ type: 'success', text: body.message ?? `${deleteDate} 삭제 완료` });
      setDeleteDate('');
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '삭제 실패' });
    } finally {
      setDeletingDay(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    setMessage(null);
    setConfirmReset(false);
    try {
      const res = await fetch('/api/data/reset', { method: 'DELETE' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `서버 오류 (${res.status})`);
      setMessage({ type: 'success', text: body.message ?? '전체 초기화 완료' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '초기화 실패' });
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <h1 className="text-2xl font-bold text-slate-100">설정</h1>
        </div>
      </header>

      <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-6 pb-32">
        <div className="mx-auto max-w-2xl space-y-6">

          {message ? (
            <div
              className={`rounded-2xl border p-4 text-sm ${
                message.type === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
              }`}
            >
              {message.text}
            </div>
          ) : null}

          {/* 고정비 관리 */}
          <a
            href="/settings/fixed-costs"
            className="block rounded-3xl border border-slate-800 bg-slate-900/90 p-6 hover:border-slate-700"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">고정비 관리</h2>
                <p className="mt-1 text-xs text-slate-400">임대료·공과금 등 매월 자동 등록 고정비</p>
              </div>
              <span className="text-slate-500 text-lg">→</span>
            </div>
          </a>

          {/* 메뉴 관리 */}
          <a
            href="/settings/menu"
            className="block rounded-3xl border border-slate-800 bg-slate-900/90 p-6 hover:border-slate-700"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">메뉴 관리</h2>
                <p className="mt-1 text-xs text-slate-400">메뉴 카테고리 등록 및 OCR 별칭 관리</p>
              </div>
              <span className="text-slate-500 text-lg">→</span>
            </div>
          </a>

          {/* 매입처 관리 */}
          <a
            href="/settings/vendors"
            className="block rounded-3xl border border-slate-800 bg-slate-900/90 p-6 hover:border-slate-700"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">매입처 관리</h2>
                <p className="mt-1 text-xs text-slate-400">매입처 정식명 및 OCR 오인식 별칭 등록</p>
              </div>
              <span className="text-slate-500 text-lg">→</span>
            </div>
          </a>

          {/* 데이터 정규화 */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">데이터 정규화</h2>
              <p className="mt-1 text-xs text-slate-400">메뉴명·매입처명의 불필요한 공백을 제거하고 중복을 병합합니다.</p>
            </div>
            <button
              type="button"
              onClick={handleNormalize}
              disabled={normalizing}
              className="w-full rounded-2xl bg-sky-700 px-6 py-4 text-base font-semibold text-white transition hover:bg-sky-600 disabled:opacity-40"
            >
              {normalizing ? '정규화 중...' : '지금 실행'}
            </button>
          </div>

          {/* 특정 날짜 삭제 */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">특정일 데이터 삭제</h2>
              <p className="mt-1 text-xs text-slate-400">선택한 날짜의 매출·매입 데이터를 삭제합니다</p>
            </div>

            <input
              type="date"
              value={deleteDate}
              onChange={(e) => setDeleteDate(e.target.value)}
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 p-3 text-base text-slate-100"
            />

            <button
              type="button"
              onClick={handleDeleteDay}
              disabled={deletingDay || !deleteDate}
              className="w-full rounded-2xl bg-rose-600 px-6 py-4 text-base font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deletingDay ? '삭제 중...' : `${deleteDate || '--'} 삭제`}
            </button>
          </div>

          {/* 전체 초기화 */}
          <div className="rounded-3xl border border-rose-900/40 bg-slate-900/90 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-rose-400">전체 데이터 초기화</h2>
              <p className="mt-1 text-xs text-slate-400">모든 매출·매입 데이터를 영구 삭제합니다. 복구할 수 없습니다.</p>
            </div>

            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="w-full rounded-2xl border border-rose-700 bg-transparent px-6 py-4 text-base font-semibold text-rose-400 transition hover:bg-rose-950/60"
              >
                전체 초기화
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-rose-300 font-medium">정말 모든 데이터를 삭제할까요?</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="flex-1 rounded-2xl border border-slate-700 bg-transparent py-3 text-sm font-semibold text-slate-400 transition hover:bg-slate-800"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={resetting}
                    className="flex-1 rounded-2xl bg-rose-600 py-3 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-40"
                  >
                    {resetting ? '초기화 중...' : '삭제 확인'}
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </main>

      <BottomTabNav />
    </>
  );
}
