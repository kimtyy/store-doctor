'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import BottomTabNav from '../../../components/BottomTabNav';
import AdminHeaderBadge from '../../../components/ui/AdminHeaderBadge';
import {
  STORE_EVENT_IMPACT_LABELS,
  STORE_EVENT_IMPACTS,
  STORE_EVENT_TYPE_META,
  STORE_EVENT_TYPES,
  StoreEventImpact,
  StoreEventRecord,
  StoreEventType,
} from '@/lib/storeEvents';
import { getHolidaysInRange } from '@/lib/holidays';

interface EventFormState {
  id: string | null;
  start_date: string;
  end_date: string;
  title: string;
  type: StoreEventType;
  impact: StoreEventImpact;
  recurring_yearly: boolean;
  memo: string;
}

function getTodayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function makeDefaultForm(startDate?: string): EventFormState {
  const d = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : getTodayStr();
  return {
    id: null,
    start_date: d,
    end_date: d,
    title: '',
    type: 'local_event',
    impact: 'unknown',
    recurring_yearly: false,
    memo: '',
  };
}

function StoreEventsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramStartDate = searchParams.get('start_date') ?? undefined;
  const paramAdd = searchParams.get('add') === '1';

  const [events, setEvents] = useState<StoreEventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(Boolean(paramStartDate || paramAdd));
  const [form, setForm] = useState<EventFormState>(() => makeDefaultForm(paramStartDate));

  useEffect(() => {
    if (paramStartDate) {
      setForm(makeDefaultForm(paramStartDate));
      setShowForm(true);
    }
  }, [paramStartDate]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/store-events?includeHolidays=false');
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? '불러오기 실패');
      setEvents(body.data ?? []);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '불러오기 실패' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const currentYearHolidays = useMemo(() => {
    const y = new Date().getFullYear();
    return getHolidaysInRange(`${y}-01-01`, `${y}-12-31`);
  }, []);

  function openNewForm() {
    setForm(makeDefaultForm(paramStartDate));
    setShowForm(true);
    setMessage(null);
  }

  function openEditForm(ev: StoreEventRecord) {
    setForm({
      id: ev.id,
      start_date: ev.start_date,
      end_date: ev.end_date,
      title: ev.title,
      type: ev.type,
      impact: ev.impact,
      recurring_yearly: ev.recurring_yearly,
      memo: ev.memo ?? '',
    });
    setShowForm(true);
    setMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const isEdit = Boolean(form.id);
      const res = await fetch('/api/store-events', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isEdit ? { id: form.id } : {}),
          start_date: form.start_date,
          end_date: form.end_date,
          title: form.title,
          type: form.type,
          impact: form.impact,
          recurring_yearly: form.recurring_yearly,
          memo: form.memo,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? '저장 실패');
      setMessage({ type: 'success', text: isEdit ? '✅ 매장 사정을 수정했습니다.' : '✅ 매장 사정을 등록했습니다.' });
      setShowForm(false);
      setForm(makeDefaultForm());
      await loadEvents();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '저장 실패' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(ev: StoreEventRecord) {
    if (!confirm(`"${ev.title}" (${ev.start_date}) 기록을 삭제할까요?`)) return;
    setMessage(null);
    try {
      const res = await fetch(`/api/store-events?id=${encodeURIComponent(ev.id)}`, {
        method: 'DELETE',
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? '삭제 실패');
      setMessage({ type: 'success', text: '✅ 삭제했습니다.' });
      if (form.id === ev.id) {
        setShowForm(false);
        setForm(makeDefaultForm());
      }
      await loadEvents();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : '삭제 실패' });
    }
  }

  const inputCls =
    'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500';

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-200 text-lg">←</button>
            <h1 className="text-xl font-bold text-slate-100">매장 사정 기록</h1>
          </div>
          <AdminHeaderBadge />
        </div>
      </header>

      <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-6 pb-32">
        <div className="mx-auto max-w-2xl space-y-5">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-xs text-slate-400 leading-relaxed">
            훈련·통제, 지역 행사, 단축영업, 매장 프로모션 등 매출에 영향을 준 특별한 일정을 기록하면 차트와 월간 보고서 AI 진단에 함께 반영됩니다. 명절·공휴일은 입력하지 않아도 자동 반영됩니다.
          </div>

          {message && (
            <div
              className={`rounded-2xl border p-4 text-sm ${
                message.type === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
              }`}
            >
              {message.text}
            </div>
          )}

          {!showForm ? (
            <button
              type="button"
              onClick={openNewForm}
              className="w-full rounded-2xl bg-sky-500 py-3.5 text-sm font-bold text-slate-950 hover:bg-sky-400 transition"
            >
              + 새 매장 사정 기록
            </button>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">
                  {form.id ? '매장 사정 수정' : '새 매장 사정 추가'}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setForm(makeDefaultForm());
                  }}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  닫기
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">시작일</label>
                  <input
                    type="date"
                    required
                    value={form.start_date}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        start_date: nextStart,
                        end_date: prev.end_date < nextStart ? nextStart : prev.end_date,
                      }));
                    }}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">종료일</label>
                  <input
                    type="date"
                    required
                    min={form.start_date}
                    value={form.end_date}
                    onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400">제목 (1~40자)</label>
                <input
                  type="text"
                  required
                  maxLength={40}
                  placeholder="예: 지역 축제, 단축영업, 매장 1주년 할인"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-2">유형</label>
                <div className="grid grid-cols-2 gap-2">
                  {STORE_EVENT_TYPES.map((t) => {
                    const meta = STORE_EVENT_TYPE_META[t];
                    const active = form.type === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            type: t,
                            recurring_yearly: t === 'holiday' ? false : prev.recurring_yearly,
                          }))
                        }
                        className={`rounded-xl border px-3 py-2 text-xs font-medium text-left transition ${
                          active
                            ? meta.darkBadgeClass
                            : 'border-slate-700 bg-slate-950/70 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-2">예상 매출 영향</label>
                <div className="grid grid-cols-3 gap-2">
                  {STORE_EVENT_IMPACTS.map((imp) => (
                    <button
                      key={imp}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, impact: imp }))}
                      className={`rounded-xl border py-2 text-xs font-medium transition ${
                        form.impact === imp
                          ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                          : 'border-slate-700 bg-slate-950/70 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {STORE_EVENT_IMPACT_LABELS[imp]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2.5 text-sm text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.type === 'holiday' ? false : form.recurring_yearly}
                    disabled={form.type === 'holiday'}
                    onChange={(e) => setForm((prev) => ({ ...prev, recurring_yearly: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-sky-500 disabled:opacity-50"
                  />
                  <span className={form.type === 'holiday' ? 'text-slate-500' : ''}>매년 같은 날짜에 반복</span>
                </label>
                {form.type === 'holiday' && (
                  <p className="mt-1.5 text-xs text-amber-300">
                    설·추석은 날짜가 매년 바뀌어 자동 표시됩니다. 영향만 기록해 두면 AI 가 다음 해 같은 명절에 참고합니다.
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs text-slate-400">메모 (선택, 200자 이내)</label>
                <textarea
                  rows={2}
                  maxLength={200}
                  placeholder="상세 내용이나 참고 사항을 적어 주세요."
                  value={form.memo}
                  onChange={(e) => setForm((prev) => ({ ...prev, memo: e.target.value }))}
                  className={inputCls}
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-2xl bg-sky-500 py-3.5 text-sm font-bold text-slate-950 hover:bg-sky-400 disabled:opacity-50 transition"
              >
                {saving ? '저장 중...' : form.id ? '수정 저장' : '등록하기'}
              </button>
            </form>
          )}

          {/* 등록된 매장 사정 목록 */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-300">기록된 매장 사정 ({events.length}건)</h2>
            {loading ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-8 text-center text-sm text-slate-400">
                불러오는 중...
              </div>
            ) : events.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">
                직접 등록한 매장 사정이 없습니다.
              </div>
            ) : (
              events.map((ev) => {
                const meta = STORE_EVENT_TYPE_META[ev.type] ?? STORE_EVENT_TYPE_META.other;
                const dateLabel =
                  ev.start_date === ev.end_date ? ev.start_date : `${ev.start_date} ~ ${ev.end_date}`;
                return (
                  <div
                    key={ev.id}
                    className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className={`rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${meta.darkBadgeClass}`}>
                            {meta.label}
                          </span>
                          <span className="rounded-lg bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                            {STORE_EVENT_IMPACT_LABELS[ev.impact]}
                          </span>
                          {ev.recurring_yearly && (
                            <span className="rounded-lg bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 text-[11px] text-indigo-300">
                              매년 반복
                            </span>
                          )}
                        </div>
                        <p className="font-semibold text-slate-100">{ev.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{dateLabel}</p>
                        {ev.memo && <p className="text-xs text-slate-400 mt-1.5">{ev.memo}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditForm(ev)}
                          className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(ev)}
                          className="rounded-lg border border-rose-800/60 px-2.5 py-1 text-xs text-rose-400 hover:bg-rose-950/40"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </section>

          {/* 자동 반영 공휴일·명절 안내 */}
          <section className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-400">
              자동 반영되는 명절·공휴일 ({new Date().getFullYear()}년)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {currentYearHolidays.map((h) => (
                <span
                  key={`${h.startDate}-${h.title}`}
                  className="rounded-lg bg-slate-800/80 px-2 py-1 text-[11px] text-slate-400"
                >
                  {h.startDate === h.endDate ? h.startDate.slice(5) : `${h.startDate.slice(5)}~${h.endDate.slice(5)}`} {h.title}
                </span>
              ))}
            </div>
          </section>
        </div>
      </main>

      <BottomTabNav />
    </>
  );
}

export default function StoreEventsSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center text-sm">
          불러오는 중...
        </div>
      }
    >
      <StoreEventsInner />
    </Suspense>
  );
}

