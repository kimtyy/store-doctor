'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import BottomTabNav from '../../../components/BottomTabNav';
import { PurchaseCategory } from '../../../types/purchase';

type CostType = 'fixed_amount' | 'manual_input';

interface FixedCost {
  id: string;
  store_id: string;
  name: string;
  amount: number;
  category: PurchaseCategory;
  billing_day: number;
  is_active: boolean;
  cost_type: CostType;
  created_at: string;
}

interface FormValues {
  name: string;
  amount: string;
  category: PurchaseCategory;
  billingDay: string;
  costType: CostType;
}

const emptyForm: FormValues = {
  name: '',
  amount: '',
  category: 'rent',
  billingDay: '1',
  costType: 'fixed_amount',
};

const categoryOptions: { value: PurchaseCategory; label: string }[] = [
  { value: 'rent', label: '임대료' },
  { value: 'labor', label: '인건비' },
  { value: 'electricity', label: '전기요금' },
  { value: 'gas', label: '가스요금' },
  { value: 'water', label: '수도요금' },
  { value: 'telecom', label: '통신비' },
  { value: 'pos_fee', label: 'POS 사용료' },
  { value: 'insurance', label: '보험료' },
  { value: 'fuel', label: '유류비' },
  { value: 'other', label: '기타' },
];

// Defined outside the page component so React never unmounts it on re-render
// (defining inside causes keyboard focus loss on every keystroke)
function FormFields({
  form,
  onChange,
}: {
  form: FormValues;
  onChange: (f: FormValues) => void;
}) {
  function scrollOnFocus(e: React.FocusEvent<HTMLInputElement>) {
    setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
  }

  return (
    <div className="space-y-3">
      {/* 타입 토글 */}
      <div>
        <label className="text-xs text-slate-400">고정비 타입</label>
        <div className="mt-1.5 flex gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...form, costType: 'fixed_amount' })}
            className={`flex-1 rounded-xl py-2 text-xs font-semibold transition ${
              form.costType === 'fixed_amount'
                ? 'bg-sky-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            금액고정
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...form, costType: 'manual_input' })}
            className={`flex-1 rounded-xl py-2 text-xs font-semibold transition ${
              form.costType === 'manual_input'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            매월입력
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {form.costType === 'fixed_amount'
            ? '매월 같은 금액으로 자동 삽입 (임대료·보험료 등)'
            : '항목만 자동 생성, 금액은 0원 → 직접 수정 (전기·가스 등)'}
        </p>
      </div>

      {/* 항목명 */}
      <div>
        <label className="text-xs text-slate-400">항목명</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          onFocus={scrollOnFocus}
          placeholder="예) 임대료, 전기요금"
          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-sm text-slate-100"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* 금액 */}
        <div>
          <label className="text-xs text-slate-400">금액 (원)</label>
          <input
            type="number"
            min={0}
            value={form.amount}
            onChange={(e) => onChange({ ...form, amount: e.target.value })}
            onFocus={scrollOnFocus}
            placeholder="0"
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-sm text-slate-100"
          />
        </div>

        {/* 청구일 */}
        <div>
          <label className="text-xs text-slate-400">매월 청구일</label>
          <input
            type="number"
            min={1}
            max={31}
            value={form.billingDay}
            onChange={(e) => onChange({ ...form, billingDay: e.target.value })}
            onFocus={scrollOnFocus}
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-sm text-slate-100"
          />
        </div>
      </div>

      {/* 카테고리 */}
      <div>
        <label className="text-xs text-slate-400">카테고리</label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {categoryOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ ...form, category: opt.value })}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                form.category === opt.value
                  ? 'bg-sky-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FixedCostsPage() {
  const [list, setList] = useState<FixedCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<FormValues>(emptyForm);
  const [saving, setSaving] = useState(false);
  const addFormRef = useRef<HTMLDivElement>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormValues>(emptyForm);
  const [editSaving, setEditSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const flash = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  // 추가 폼 열릴 때 스크롤
  useEffect(() => {
    if (showAdd && addFormRef.current) {
      setTimeout(() => addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }, [showAdd]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fixed-costs');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '불러오기 실패');
      setList(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  async function handleAdd() {
    if (!addForm.name) { setError('항목명을 입력하세요.'); return; }
    if (addForm.costType === 'fixed_amount' && !addForm.amount) { setError('금액고정 타입은 금액을 입력하세요.'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/fixed-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addForm.name,
          amount: Number(addForm.amount) || 0,
          category: addForm.category,
          billingDay: Number(addForm.billingDay),
          costType: addForm.costType,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '저장 실패');
      setList((prev) => [...prev, json.data]);
      setAddForm(emptyForm);
      setShowAdd(false);
      flash('✅ 고정비가 추가되었습니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(fc: FixedCost) {
    setEditId(fc.id);
    setEditForm({
      name: fc.name,
      amount: String(fc.amount),
      category: fc.category,
      billingDay: String(fc.billing_day),
      costType: fc.cost_type ?? 'fixed_amount',
    });
  }

  async function handleEdit() {
    if (!editId || !editForm.name) return;
    if (editForm.costType === 'fixed_amount' && !editForm.amount) { setError('금액을 입력하세요.'); return; }
    setEditSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/fixed-costs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editId,
          name: editForm.name,
          amount: Number(editForm.amount) || 0,
          category: editForm.category,
          billingDay: Number(editForm.billingDay),
          costType: editForm.costType,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '수정 실패');
      setList((prev) =>
        prev.map((fc) =>
          fc.id === editId
            ? {
                ...fc,
                name: editForm.name,
                amount: editForm.costType === 'manual_input' ? 0 : Number(editForm.amount),
                category: editForm.category,
                billing_day: Number(editForm.billingDay),
                cost_type: editForm.costType,
              }
            : fc
        )
      );
      setEditId(null);
      flash('✅ 수정되었습니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleToggle(fc: FixedCost) {
    setTogglingId(fc.id);
    try {
      const res = await fetch('/api/fixed-costs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: fc.id, isActive: !fc.is_active }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '변경 실패');
      setList((prev) => prev.map((f) => (f.id === fc.id ? { ...f, is_active: !f.is_active } : f)));
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch('/api/fixed-costs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '삭제 실패');
      setList((prev) => prev.filter((fc) => fc.id !== id));
      if (editId === id) setEditId(null);
      flash('삭제되었습니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setDeletingId(null);
    }
  }

  const categoryLabel = (cat: string) =>
    categoryOptions.find((o) => o.value === cat)?.label ?? cat;

  const costTypeLabel = (t?: CostType) =>
    t === 'manual_input' ? '매월입력' : '금액고정';

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center gap-3">
          <a href="/settings" className="text-slate-400 hover:text-slate-200 text-sm">← 설정</a>
          <h1 className="text-xl font-bold text-slate-100">고정비 관리</h1>
        </div>
      </header>

      <main className="bg-slate-950 text-slate-100 px-4 py-6 pb-32">
        <div className="mx-auto max-w-2xl space-y-4">

          {error && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>
          )}
          {success && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{success}</div>
          )}

          {/* 추가 버튼 / 폼 */}
          {!showAdd ? (
            <button
              type="button"
              onClick={() => { setShowAdd(true); setError(null); }}
              className="w-full rounded-2xl border border-dashed border-slate-700 py-4 text-sm font-semibold text-slate-400 hover:border-sky-600 hover:text-sky-400 transition"
            >
              + 고정비 추가
            </button>
          ) : (
            <div ref={addFormRef} className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
              <h2 className="text-base font-semibold">새 고정비</h2>
              <FormFields form={addForm} onChange={setAddForm} />
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowAdd(false); setAddForm(emptyForm); setError(null); }}
                  className="flex-1 rounded-2xl border border-slate-700 py-3 text-sm font-semibold text-slate-400 hover:bg-slate-800 transition"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={saving}
                  className="flex-1 rounded-2xl bg-sky-600 py-3 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50 transition"
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          )}

          {/* 목록 */}
          {loading ? (
            <p className="text-sm text-slate-400 animate-pulse text-center py-10">불러오는 중...</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-12">등록된 고정비가 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {list.map((fc) => (
                <div
                  key={fc.id}
                  className={`rounded-2xl border bg-slate-900/90 overflow-hidden transition ${
                    fc.is_active ? 'border-slate-800' : 'border-slate-800/50 opacity-60'
                  }`}
                >
                  {/* 헤더 */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleToggle(fc)}
                      disabled={togglingId === fc.id}
                      className={`shrink-0 w-11 h-6 rounded-full transition-colors ${fc.is_active ? 'bg-sky-600' : 'bg-slate-700'}`}
                    >
                      <span
                        className={`block w-5 h-5 rounded-full bg-white shadow transition-transform mx-0.5 ${
                          fc.is_active ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>

                    <div className="flex-1 min-w-0" onClick={() => setEditId(editId === fc.id ? null : fc.id)}>
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-slate-100 truncate">{fc.name}</span>
                        <span
                          className={`text-xs shrink-0 rounded-full px-1.5 py-0.5 font-medium ${
                            fc.cost_type === 'manual_input'
                              ? 'bg-amber-900/40 text-amber-400'
                              : 'bg-sky-900/40 text-sky-400'
                          }`}
                        >
                          {costTypeLabel(fc.cost_type)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {categoryLabel(fc.category)} · 매월 {fc.billing_day}일
                        {fc.amount > 0 && ` · ${fc.amount.toLocaleString()}원`}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => { if (editId === fc.id) { setEditId(null); } else { startEdit(fc); } }}
                        className="text-xs text-slate-400 hover:text-slate-200"
                      >
                        {editId === fc.id ? '접기' : '수정'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(fc.id)}
                        disabled={deletingId === fc.id}
                        className="text-xs text-rose-400 hover:text-rose-300 disabled:opacity-40"
                      >
                        {deletingId === fc.id ? '...' : '삭제'}
                      </button>
                    </div>
                  </div>

                  {/* 인라인 수정 */}
                  {editId === fc.id && (
                    <div className="border-t border-slate-800 px-4 pb-4 pt-3 space-y-4">
                      <FormFields form={editForm} onChange={setEditForm} />
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setEditId(null)}
                          className="flex-1 rounded-2xl border border-slate-700 py-2.5 text-sm font-semibold text-slate-400 hover:bg-slate-800 transition"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={handleEdit}
                          disabled={editSaving}
                          className="flex-1 rounded-2xl bg-sky-600 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50 transition"
                        >
                          {editSaving ? '저장 중...' : '저장'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 안내 */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-500 space-y-1">
            <p>• 활성화된 고정비는 매월 1일 자동으로 매입 내역에 추가됩니다.</p>
            <p>• <span className="text-sky-400">금액고정</span>: 설정 금액 그대로 삽입 (임대료·보험료 등)</p>
            <p>• <span className="text-amber-400">매월입력</span>: 매월 자동 항목 생성, 금액은 매입 탭에서 직접 수정 (전기·가스 등). 기본값 설정 가능.</p>
            <p>• 이미 추가된 달은 중복 삽입되지 않습니다.</p>
          </div>

        </div>
      </main>

      <BottomTabNav />
    </>
  );
}
