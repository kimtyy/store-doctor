'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PurchaseCategory, PurchaseRecord, PurchaseItem } from '../../types/purchase';
import CameraModal from '../../components/ui/CameraModal';
import { compressImage } from '../../lib/compressImage';
import BottomTabNav from '../../components/BottomTabNav';

function NumericTextInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  const [isNeg, setIsNeg] = useState(value < 0);
  const [raw, setRaw] = useState(String(Math.abs(value)));
  const externalRef = useRef(value);

  useEffect(() => {
    if (externalRef.current !== value) {
      externalRef.current = value;
      setIsNeg(value < 0);
      setRaw(String(Math.abs(value)));
    }
  }, [value]);

  function commit(digits: string, neg: boolean) {
    const abs = digits === '' ? 0 : Number(digits);
    const n = neg && abs !== 0 ? -abs : abs;
    externalRef.current = n;
    onChange(n);
  }

  function toggleSign() {
    const next = !isNeg;
    setIsNeg(next);
    commit(raw, next);
  }

  return (
    <div className="flex gap-0.5">
      <button
        type="button"
        onClick={toggleSign}
        className={`shrink-0 w-6 rounded text-xs font-bold border transition ${
          isNeg
            ? 'border-rose-500 text-rose-400 bg-rose-950/40'
            : 'border-slate-700 text-slate-500 bg-slate-950'
        }`}
      >
        {isNeg ? '−' : '+'}
      </button>
      <input
        type="text"
        inputMode="decimal"
        value={raw}
        className={`min-w-0 flex-1 ${className ?? ''}`}
        onChange={(e) => {
          const v = e.target.value;
          if (/^\d*$/.test(v)) {
            setRaw(v);
            commit(v, isNeg);
          }
        }}
        onFocus={(e) => {
          if (raw === '0' || raw === '') e.target.select();
        }}
        onBlur={() => {
          if (raw === '') setRaw('0');
        }}
      />
    </div>
  );
}

const categoryOptions: PurchaseCategory[] = [
  'food_ingredients',
  'alcohol',
  'consumables',
  'labor',
  'rent',
  'electricity',
  'gas',
  'water',
  'telecom',
  'pos_fee',
  'insurance',
  'other',
];

const categoryLabels: Record<PurchaseCategory, string> = {
  food_ingredients: '식자재',
  alcohol: '주류',
  consumables: '소모품',
  labor: '인건비',
  rent: '임대료',
  electricity: '전기요금',
  gas: '가스요금',
  water: '수도요금',
  telecom: '통신비',
  pos_fee: 'POS 사용료',
  insurance: '보험료',
  other: '기타',
};

type EditablePurchase = Omit<PurchaseRecord, 'id' | 'storeId' | 'createdAt'> & {
  category: PurchaseCategory | '';
};

async function savePurchase(record: EditablePurchase & { note?: string }): Promise<void> {
  const response = await fetch('/api/purchases/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vendorName: record.vendorName,
      date: record.date,
      totalAmount: record.totalAmount,
      taxAmount: record.taxAmount,
      netAmount: record.netAmount,
      category: record.category,
      items: record.items,
      inputMethod: record.inputMethod,
      note: record.note,
    }),
  });

  const responseText = await response.text();
  if (!responseText || responseText.trim() === '') {
    throw new Error('서버로부터 빈 응답을 받았습니다.');
  }
  const body = JSON.parse(responseText);
  if (!response.ok) throw new Error(body.error || `서버 오류 (${response.status})`);
  if (!body.success) throw new Error('저장 결과를 확인할 수 없습니다.');
}

interface PurchaseHistoryItem {
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface PurchaseHistoryRecord {
  id: string;
  date: string;
  vendor_name: string;
  total_amount: number;
  category: string;
  note: string | null;
  items: PurchaseHistoryItem[];
}

export default function PurchasesInputPage() {
  const [activeTab, setActiveTab] = useState<'photo' | 'manual' | 'history'>('photo');

  const [historyList, setHistoryList] = useState<PurchaseHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftItems, setDraftItems] = useState<Record<string, PurchaseHistoryItem[]>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch('/api/purchases');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '불러오기 실패');
      setHistoryList(json.data ?? []);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
  }, [activeTab, fetchHistory]);

  function toggleExpand(record: PurchaseHistoryRecord) {
    if (expandedId === record.id) {
      setExpandedId(null);
    } else {
      setExpandedId(record.id);
      if (!draftItems[record.id]) {
        setDraftItems((prev) => ({ ...prev, [record.id]: record.items.map((i) => ({ ...i })) }));
      }
    }
  }

  function updateDraftItem(recordId: string, idx: number, patch: Partial<PurchaseHistoryItem>) {
    setDraftItems((prev) => {
      const items = [...(prev[recordId] ?? [])];
      items[idx] = { ...items[idx], ...patch };
      return { ...prev, [recordId]: items };
    });
  }

  function deleteDraftItem(recordId: string, idx: number) {
    setDraftItems((prev) => ({
      ...prev,
      [recordId]: (prev[recordId] ?? []).filter((_, i) => i !== idx),
    }));
  }

  function addDraftItem(recordId: string) {
    setDraftItems((prev) => ({
      ...prev,
      [recordId]: [...(prev[recordId] ?? []), { name: '', quantity: 1, unitPrice: 0, amount: 0 }],
    }));
  }

  async function saveDraftItems(record: PurchaseHistoryRecord) {
    const items = draftItems[record.id] ?? record.items;
    const totalAmount = items.reduce((s, i) => s + i.amount, 0) || record.total_amount;
    setSavingId(record.id);
    setError(null);
    try {
      const res = await fetch('/api/purchases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id, items, totalAmount }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '저장 실패');
      setHistoryList((prev) =>
        prev.map((r) => (r.id === record.id ? { ...r, items, total_amount: totalAmount } : r))
      );
      setSaveSuccess('✅ 품목 수정 완료!');
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setSavingId(null);
    }
  }

  // 사진 탭
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [editableResult, setEditableResult] = useState<EditablePurchase | null>(null);
  const [loadingParse, setLoadingParse] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);

  // 수동 탭
  const [manualRecord, setManualRecord] = useState<PurchaseRecord>({
    date: new Date().toISOString().split('T')[0],
    vendorName: '',
    totalAmount: 0,
    taxAmount: 0,
    netAmount: 0,
    category: 'food_ingredients',
    items: [],
    inputMethod: 'manual',
  });
  const [note, setNote] = useState('');
  const [savingManual, setSavingManual] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [purchaseCameraOpen, setPurchaseCameraOpen] = useState(false);

  const manualTotal = useMemo(
    () => manualRecord.items.reduce((sum, item) => sum + item.amount, 0),
    [manualRecord.items]
  );

  const photoTotal = useMemo(
    () =>
      editableResult?.items && editableResult.items.length > 0
        ? editableResult.items.reduce((sum, item) => sum + item.amount, 0)
        : editableResult?.totalAmount ?? 0,
    [editableResult]
  );

  function updateEditableItem(index: number, value: Partial<PurchaseItem>) {
    setEditableResult((current) => {
      if (!current) return current;
      const items = [...current.items];
      items[index] = { ...items[index], ...value };
      return { ...current, items };
    });
  }

  function addEditableItem() {
    setEditableResult((current) => {
      if (!current) return current;
      return {
        ...current,
        items: [...current.items, { name: '', quantity: 1, unitPrice: 0, amount: 0 }],
      };
    });
  }

  function deleteEditableItem(index: number) {
    setEditableResult((current) => {
      if (!current) return current;
      return { ...current, items: current.items.filter((_, i) => i !== index) };
    });
  }

  function updateManualItem(index: number, value: Partial<PurchaseItem>) {
    setManualRecord((current) => {
      const items = [...current.items];
      items[index] = { ...items[index], ...value };
      return { ...current, items };
    });
  }

  function addManualItem() {
    setManualRecord((current) => ({
      ...current,
      items: [...current.items, { name: '', quantity: 1, unitPrice: 0, amount: 0 }],
    }));
  }

  function deleteManualItem(index: number) {
    setManualRecord((current) => ({
      ...current,
      items: current.items.filter((_, i) => i !== index),
    }));
  }

  async function handlePurchaseParse() {
    if (!receiptFile) {
      setError('매입 영수증 사진을 선택해주세요.');
      return;
    }
    setError(null);
    setSaveSuccess(null);
    setEditableResult(null);
    setLoadingParse(true);

    try {
      const dataUrl = await compressImage(receiptFile);
      const response = await fetch('/api/parse/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: [dataUrl] }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? '파싱에 실패했습니다.');
      const parsed = body.data as PurchaseRecord;
      setEditableResult({
        date: parsed.date ?? new Date().toISOString().split('T')[0],
        vendorName: parsed.vendorName ?? '',
        totalAmount: parsed.totalAmount ?? 0,
        taxAmount: parsed.taxAmount ?? 0,
        netAmount: parsed.netAmount ?? 0,
        category: (parsed.category as PurchaseCategory) ?? '',
        items: parsed.items ?? [],
        inputMethod: 'receipt_photo',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoadingParse(false);
    }
  }

  async function handleSavePhoto() {
    if (!editableResult) {
      setError('저장할 매입 데이터가 없습니다.');
      return;
    }
    if (!editableResult.category) {
      setError('카테고리를 선택해주세요.');
      return;
    }
    setError(null);
    setSaveSuccess(null);
    setSavingPhoto(true);

    try {
      await savePurchase({
        ...editableResult,
        totalAmount: photoTotal,
        netAmount: photoTotal - (editableResult.taxAmount ?? 0),
        inputMethod: 'receipt_photo',
      });
      setSaveSuccess('✅ 저장 완료!');
      setEditableResult(null);
      setReceiptFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setSavingPhoto(false);
    }
  }

  async function handleSaveManual() {
    if (!manualRecord.vendorName) {
      setError('구매처를 입력해주세요.');
      return;
    }
    setError(null);
    setSaveSuccess(null);
    setSavingManual(true);

    try {
      await savePurchase({
        ...manualRecord,
        totalAmount: manualTotal,
        netAmount: manualTotal,
        note,
        inputMethod: 'manual',
      });
      setSaveSuccess('✅ 저장 완료!');
      setManualRecord({
        date: new Date().toISOString().split('T')[0],
        vendorName: '',
        totalAmount: 0,
        taxAmount: 0,
        netAmount: 0,
        category: 'food_ingredients',
        items: [],
        inputMethod: 'manual',
      });
      setNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setSavingManual(false);
    }
  }

  return (
    <>
      <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-6 pb-32">
        <CameraModal
          isOpen={purchaseCameraOpen}
          onCapture={(file) => setReceiptFile(file)}
          onClose={() => setPurchaseCameraOpen(false)}
          galleryInputId="purchase-gallery-input"
        />
        <input
          id="purchase-gallery-input"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
        />

        <div className="max-w-2xl space-y-6">
          <div>
            <h1 className="text-3xl font-bold">매입 입력</h1>
            <p className="mt-2 text-sm text-slate-400">영수증 또는 수동으로 기록하세요</p>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>
          ) : null}

          {saveSuccess ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{saveSuccess}</div>
          ) : null}

          {/* 탭 */}
          <div className="flex gap-2 rounded-2xl bg-slate-900/80 p-2">
            <button
              type="button"
              onClick={() => setActiveTab('photo')}
              className={`flex-1 rounded-xl py-3 text-sm font-semibold transition ${
                activeTab === 'photo' ? 'bg-slate-800 text-white' : 'bg-transparent text-slate-400'
              }`}
            >
              📷 사진
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('manual')}
              className={`flex-1 rounded-xl py-3 text-sm font-semibold transition ${
                activeTab === 'manual' ? 'bg-slate-800 text-white' : 'bg-transparent text-slate-400'
              }`}
            >
              ✏️ 수동
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`flex-1 rounded-xl py-3 text-sm font-semibold transition ${
                activeTab === 'history' ? 'bg-slate-800 text-white' : 'bg-transparent text-slate-400'
              }`}
            >
              📋 내역
            </button>
          </div>

          {activeTab === 'history' ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">매입 내역</h2>
                <button
                  type="button"
                  onClick={fetchHistory}
                  disabled={historyLoading}
                  className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40"
                >
                  새로고침
                </button>
              </div>

              {historyLoading && (
                <p className="text-sm text-slate-400 animate-pulse text-center py-6">불러오는 중...</p>
              )}

              {historyError && (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
                  {historyError}
                </div>
              )}

              {!historyLoading && !historyError && historyList.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-8">저장된 매입 내역이 없습니다.</p>
              )}

              {!historyLoading && !historyError && historyList.length > 0 && (
                <div className="space-y-2">
                  {historyList.map((record) => {
                    const isExpanded = expandedId === record.id;
                    const draft = draftItems[record.id] ?? record.items;
                    const itemCount = record.items?.length ?? 0;

                    return (
                      <div key={record.id} className="rounded-2xl border border-slate-800 bg-slate-950/60">
                        {/* Header row — tap to expand */}
                        <button
                          type="button"
                          onClick={() => toggleExpand(record)}
                          className="w-full px-4 py-3 text-left"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-slate-500">{record.date}</span>
                            <span className="text-sm font-semibold text-emerald-400">
                              {record.total_amount.toLocaleString()}원
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-slate-200 truncate flex-1">{record.vendor_name}</span>
                            <span className="shrink-0 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-400">
                              {categoryLabels[record.category as PurchaseCategory] ?? record.category}
                            </span>
                            <span className="shrink-0 text-xs text-slate-500">
                              {itemCount > 0 ? `${itemCount}개 품목` : '품목 없음'} {isExpanded ? '▲' : '▼'}
                            </span>
                          </div>
                          {record.note ? (
                            <p className="mt-1 text-xs text-slate-500 truncate">{record.note}</p>
                          ) : null}
                        </button>

                        {/* Expanded — item list */}
                        {isExpanded && (
                          <div className="border-t border-slate-800 px-4 pb-4 pt-3 space-y-3">
                            {draft.length === 0 && (
                              <p className="text-xs text-slate-500 text-center py-2">품목이 없습니다.</p>
                            )}

                            {draft.map((item, idx) => (
                              <div key={idx} className="rounded-xl border border-slate-800 bg-slate-900 p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-slate-500">품목 {idx + 1}</span>
                                  <button
                                    type="button"
                                    onClick={() => deleteDraftItem(record.id, idx)}
                                    className="text-xs text-rose-400 hover:text-rose-300"
                                  >
                                    삭제
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  value={item.name}
                                  onChange={(e) => updateDraftItem(record.id, idx, { name: e.target.value })}
                                  placeholder="품목명"
                                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
                                />
                                <div className="grid gap-2" style={{ gridTemplateColumns: '3rem 1fr 1.5fr' }}>
                                  <div>
                                    <p className="text-xs text-slate-500 mb-1">수량</p>
                                    <input
                                      type="number"
                                      min={1}
                                      value={item.quantity}
                                      onChange={(e) => updateDraftItem(record.id, idx, { quantity: Number(e.target.value) })}
                                      onFocus={(e) => e.target.select()}
                                      className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
                                    />
                                  </div>
                                  <div>
                                    <p className="text-xs text-slate-500 mb-1">단가</p>
                                    <NumericTextInput
                                      value={item.unitPrice}
                                      onChange={(n) => updateDraftItem(record.id, idx, { unitPrice: n })}
                                      className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
                                    />
                                  </div>
                                  <div>
                                    <p className="text-xs text-slate-500 mb-1">금액</p>
                                    <NumericTextInput
                                      value={item.amount}
                                      onChange={(n) => updateDraftItem(record.id, idx, { amount: n })}
                                      className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}

                            <button
                              type="button"
                              onClick={() => addDraftItem(record.id)}
                              className="w-full rounded-xl border border-dashed border-slate-700 py-2 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-200 transition"
                            >
                              + 품목 추가
                            </button>

                            <button
                              type="button"
                              onClick={() => saveDraftItems(record)}
                              disabled={savingId === record.id}
                              className="w-full rounded-2xl bg-sky-600 py-3 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50 transition"
                            >
                              {savingId === record.id ? '저장 중...' : '저장하기'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeTab === 'photo' ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 space-y-4">
              <h2 className="text-lg font-semibold">영수증 사진</h2>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPurchaseCameraOpen(true)}
                  className="flex-1 rounded-2xl border border-slate-700 bg-slate-950/80 py-4 text-sm font-medium text-slate-100 hover:bg-slate-900 transition"
                >
                  📷 사진 찍기
                </button>
                <label
                  htmlFor="purchase-gallery-input"
                  className="flex-1 rounded-2xl border border-slate-700 bg-slate-950/80 py-4 text-sm font-medium text-slate-100 hover:bg-slate-900 transition text-center cursor-pointer"
                >
                  🖼️ 갤러리에서 선택
                </label>
              </div>

              {receiptFile ? (
                <p className="text-xs text-slate-400 truncate">선택됨: {receiptFile.name}</p>
              ) : null}

              <button
                type="button"
                onClick={handlePurchaseParse}
                disabled={loadingParse || !receiptFile}
                className="w-full rounded-2xl bg-rose-500 px-6 py-4 text-base font-semibold text-slate-950 transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingParse ? '파싱 중...' : '영수증 파싱하기'}
              </button>

              {/* 파싱 결과 - 편집 가능 */}
              {editableResult ? (
                <div className="rounded-2xl bg-slate-950/80 p-5 space-y-5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">파싱 결과 — 수정 후 저장</p>

                  {/* 구매처 + 날짜 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400">구매처</label>
                      <input
                        type="text"
                        value={editableResult.vendorName}
                        onChange={(e) => setEditableResult((c) => c ? { ...c, vendorName: e.target.value } : c)}
                        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-sm text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">날짜</label>
                      <input
                        type="date"
                        value={editableResult.date}
                        onChange={(e) => setEditableResult((c) => c ? { ...c, date: e.target.value } : c)}
                        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-sm text-slate-100"
                      />
                    </div>
                  </div>

                  {/* 카테고리 칩 — 필수 */}
                  <div>
                    <p className="text-xs text-slate-400 mb-2">
                      카테고리 <span className="text-rose-400">*필수</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {categoryOptions.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setEditableResult((c) => c ? { ...c, category: cat } : c)}
                          className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                            editableResult.category === cat
                              ? 'bg-sky-500 text-slate-950'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {categoryLabels[cat]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 품목 리스트 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-slate-400">품목 ({editableResult.items.length}개)</p>
                      <button
                        type="button"
                        onClick={addEditableItem}
                        className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-600"
                      >
                        + 추가
                      </button>
                    </div>
                    <div className="space-y-3">
                      {editableResult.items.map((item, index) => (
                        <div key={index} className="rounded-xl border border-slate-800 bg-slate-900 p-3 space-y-2">
                          <div className="flex justify-between items-center">
                            <p className="text-xs text-slate-500">품목 {index + 1}</p>
                            <button
                              type="button"
                              onClick={() => deleteEditableItem(index)}
                              className="text-xs text-rose-400 hover:text-rose-300"
                            >
                              삭제
                            </button>
                          </div>
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => updateEditableItem(index, { name: e.target.value })}
                            placeholder="품목명"
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
                          />
                          <div className="grid gap-2" style={{ gridTemplateColumns: '3rem 1fr' }}>
                            <div>
                              <p className="text-xs text-slate-500 mb-1">수량</p>
                              <input
                                type="number"
                                min={1}
                                value={item.quantity}
                                onChange={(e) => updateEditableItem(index, { quantity: Number(e.target.value) })}
                                onFocus={(e) => e.target.select()}
                                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
                              />
                            </div>
                            <div>
                              <p className="text-xs text-slate-500 mb-1">금액</p>
                              <NumericTextInput
                                value={item.amount}
                                onChange={(n) => updateEditableItem(index, { amount: n })}
                                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {editableResult.items.length === 0 ? (
                        <p className="text-xs text-slate-500 text-center py-2">품목 없음 (합계 금액만 저장)</p>
                      ) : null}
                    </div>
                  </div>

                  {/* 합계 */}
                  <div className="rounded-xl bg-slate-900/80 p-4 border border-slate-800">
                    <p className="text-xs text-slate-400">합계</p>
                    <p className="mt-1 text-2xl font-bold text-emerald-400">{photoTotal.toLocaleString()}원</p>
                  </div>

                  <button
                    type="button"
                    onClick={handleSavePhoto}
                    disabled={savingPhoto || !editableResult.category}
                    className="w-full rounded-2xl bg-slate-800 px-6 py-4 text-base font-semibold text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingPhoto
                      ? '저장 중...'
                      : !editableResult.category
                      ? '카테고리를 선택하세요'
                      : '저장하기'}
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 space-y-4">
              <h2 className="text-lg font-semibold">빠른 수동 입력</h2>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-slate-300">구매처</label>
                  <input
                    type="text"
                    value={manualRecord.vendorName}
                    onChange={(e) => setManualRecord({ ...manualRecord, vendorName: e.target.value })}
                    placeholder="예) 홈플러스"
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 p-3 text-base text-slate-100"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-300">일자</label>
                  <input
                    type="date"
                    value={manualRecord.date}
                    onChange={(e) => setManualRecord({ ...manualRecord, date: e.target.value })}
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 p-3 text-base text-slate-100"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-300">카테고리</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {categoryOptions.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setManualRecord({ ...manualRecord, category: cat })}
                        className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                          manualRecord.category === cat
                            ? 'bg-sky-500 text-slate-950'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {categoryLabels[cat]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-300">메모 (선택)</label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="예) 시장 생선 50만원"
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 p-3 text-base text-slate-100"
                  />
                </div>
              </div>

              {/* 품목 리스트 */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-300">품목 ({manualRecord.items.length})</p>
                  <button
                    type="button"
                    onClick={addManualItem}
                    className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-600"
                  >
                    + 추가
                  </button>
                </div>

                <div className="mt-3 space-y-3">
                  {manualRecord.items.map((item, index) => (
                    <div key={index} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 space-y-2">
                      <div className="flex justify-between items-start">
                        <p className="text-xs text-slate-400">품목 {index + 1}</p>
                        <button
                          type="button"
                          onClick={() => deleteManualItem(index)}
                          className="text-xs text-rose-400 hover:text-rose-300"
                        >
                          삭제
                        </button>
                      </div>
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateManualItem(index, { name: e.target.value })}
                        placeholder="품목명"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
                      />
                      <div className="grid gap-2" style={{ gridTemplateColumns: '3rem 1fr' }}>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateManualItem(index, { quantity: Number(e.target.value) })}
                          onFocus={(e) => e.target.select()}
                          placeholder="수량"
                          className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
                        />
                        <NumericTextInput
                          value={item.amount}
                          onChange={(n) => updateManualItem(index, { amount: n })}
                          className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 합계 */}
              <div className="rounded-2xl bg-slate-950/80 p-5 border border-slate-800">
                <p className="text-xs text-slate-400">합계</p>
                <p className="mt-2 text-3xl font-bold text-emerald-400">{manualTotal.toLocaleString()}원</p>
              </div>

              <button
                type="button"
                onClick={handleSaveManual}
                disabled={savingManual || !manualRecord.vendorName}
                className="w-full rounded-2xl bg-slate-800 px-6 py-4 text-base font-semibold text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingManual ? '저장 중...' : '저장하기'}
              </button>
            </div>
          )}
        </div>
      </main>

      <BottomTabNav />
    </>
  );
}
