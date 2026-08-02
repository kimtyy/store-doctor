'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PurchaseCategory, PurchaseRecord, PurchaseItem } from '../../types/purchase';
import CameraModal from '../../components/ui/CameraModal';
import { compressImage } from '../../lib/compressImage';
import BottomTabNav from '../../components/BottomTabNav';
import PeriodSelector, { PeriodValue, MonthSelection } from '../../components/PeriodSelector';

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
  'fuel',
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
  fuel: '유류비',
  other: '기타',
};

type EditablePurchase = Omit<PurchaseRecord, 'id' | 'storeId' | 'createdAt'> & {
  category: PurchaseCategory | '';
};

async function savePurchase(record: EditablePurchase & { note?: string; memo?: string; isEvent?: boolean }): Promise<void> {
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
      memo: record.memo,
      isEvent: record.isEvent ?? false,
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
  memo: string | null;
  items: PurchaseHistoryItem[];
}

export default function PurchasesInputPage() {
  const [activeTab, setActiveTab] = useState<'photo' | 'manual' | 'history'>('photo');

  const [historyList, setHistoryList] = useState<PurchaseHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftItems, setDraftItems] = useState<Record<string, PurchaseHistoryItem[]>>({});
  const [draftDates, setDraftDates] = useState<Record<string, string>>({});
  const [draftVendorNames, setDraftVendorNames] = useState<Record<string, string>>({});
  const [draftMemos, setDraftMemos] = useState<Record<string, string>>({});
  const [draftTotalAmounts, setDraftTotalAmounts] = useState<Record<string, number>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [historyPeriodValue, setHistoryPeriodValue] = useState<PeriodValue>(() => ({
    type: '30',
    selectedMonth: {
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
    },
  }));
  const [availableMonths, setAvailableMonths] = useState<MonthSelection[]>([]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetch('/api/analytics/months')
        .then((r) => r.json())
        .then((d) => {
          if (d.months) setAvailableMonths(d.months);
        })
        .catch(() => {});
    }
  }, [activeTab]);

  const filteredPurchaseHistory = useMemo(() => {
    let list = historyList.filter((r) => !(r as any).is_event);

    if (historyPeriodValue.type === '7') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      list = list.filter((r) => r.date >= cutoffStr);
    } else if (historyPeriodValue.type === '30') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      list = list.filter((r) => r.date >= cutoffStr);
    } else if (historyPeriodValue.type === 'monthly' && historyPeriodValue.selectedMonth) {
      const { year, month } = historyPeriodValue.selectedMonth;
      const ym = `${year}-${String(month).padStart(2, '0')}`;
      list = list.filter((r) => r.date.startsWith(ym));
    } else if (historyPeriodValue.type === 'custom' && historyPeriodValue.customRange) {
      const { startDate, endDate } = historyPeriodValue.customRange;
      list = list.filter((r) => r.date >= startDate && r.date <= endDate);
    }

    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [historyList, historyPeriodValue]);

  const historySumAmount = useMemo(
    () => filteredPurchaseHistory.reduce((s, r) => s + r.total_amount, 0),
    [filteredPurchaseHistory]
  );

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
      // Always reset from current record — ensures post-save values are shown on reopen
      setDraftItems((prev) => ({ ...prev, [record.id]: (record.items ?? []).map((i) => ({ ...i })) }));
      setDraftDates((prev) => ({ ...prev, [record.id]: record.date }));
      setDraftVendorNames((prev) => ({ ...prev, [record.id]: record.vendor_name }));
      setDraftMemos((prev) => ({ ...prev, [record.id]: record.memo ?? '' }));
      setDraftTotalAmounts((prev) => ({ ...prev, [record.id]: record.total_amount }));
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

  async function deleteRecord(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/purchases?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? '삭제 실패');
      setHistoryList((prev) => prev.filter((r) => r.id !== id));
      if (expandedId === id) setExpandedId(null);
      setSaveSuccess('✅ 삭제 완료!');
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  async function saveDraftItems(record: PurchaseHistoryRecord) {
    const items = draftItems[record.id] ?? record.items;
    const computedSum = items.reduce((s, i) => s + i.amount, 0);
    const totalAmount = items.length > 0 ? computedSum : (draftTotalAmounts[record.id] ?? record.total_amount);
    const vendorName = draftVendorNames[record.id] ?? record.vendor_name;
    setSavingId(record.id);
    setError(null);
    try {
      const res = await fetch('/api/purchases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: record.id,
          items,
          totalAmount,
          date: draftDates[record.id],
          vendorName,
          memo: draftMemos[record.id],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '저장 실패');
      setHistoryList((prev) =>
        prev.map((r) =>
          r.id === record.id
            ? {
                ...r,
                items,
                total_amount: totalAmount,
                vendor_name: vendorName,
                date: draftDates[record.id] ?? r.date,
                memo: draftMemos[record.id] ?? r.memo,
              }
            : r
        )
      );
      setSaveSuccess('✅ 수정 완료!');
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
  const [memo, setMemo] = useState('');
  const [savingManual, setSavingManual] = useState(false);

  // autocomplete
  const vendorDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [vendorSuggestions, setVendorSuggestions] = useState<string[]>([]);
  const [showVendorSug, setShowVendorSug] = useState(false);
  const [itemSuggestions, setItemSuggestions] = useState<Record<number, string[]>>({});
  const [activeItemIdx, setActiveItemIdx] = useState<number | null>(null);
  const [photoItemSuggestions, setPhotoItemSuggestions] = useState<Record<number, string[]>>({});
  const [activePhotoItemIdx, setActivePhotoItemIdx] = useState<number | null>(null);

  const handleVendorKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Tab' || e.key === 'Enter') && showVendorSug && vendorSuggestions.length > 0) {
      e.preventDefault();
      setManualRecord(r => ({ ...r, vendorName: vendorSuggestions[0] }));
      setShowVendorSug(false);
    }
  };

  const handleItemKeyDown = (index: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    const sug = itemSuggestions[index];
    if ((e.key === 'Tab' || e.key === 'Enter') && activeItemIdx === index && sug && sug.length > 0) {
      e.preventDefault();
      updateManualItem(index, { name: sug[0] });
      setActiveItemIdx(null);
    }
  };

  const handlePhotoItemKeyDown = (index: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    const sug = photoItemSuggestions[index];
    if ((e.key === 'Tab' || e.key === 'Enter') && activePhotoItemIdx === index && sug && sug.length > 0) {
      e.preventDefault();
      updateEditableItem(index, { name: sug[0] });
      setActivePhotoItemIdx(null);
    }
  };

  function handlePhotoItemNameChange(index: number, value: string) {
    updateEditableItem(index, { name: value });
    if (itemDebounce.current) clearTimeout(itemDebounce.current);
    if (!value.trim()) { setPhotoItemSuggestions(prev => ({ ...prev, [index]: [] })); setActivePhotoItemIdx(null); return; }
    itemDebounce.current = setTimeout(async () => {
      const res = await fetch(`/api/purchases/autocomplete?q=${encodeURIComponent(value)}&type=item`);
      const json = await res.json().catch(() => ({}));
      const sug: string[] = json.suggestions ?? [];
      setPhotoItemSuggestions(prev => ({ ...prev, [index]: sug }));
      setActivePhotoItemIdx(sug.length > 0 ? index : null);
    }, 200);
  }

  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [purchaseCameraOpen, setPurchaseCameraOpen] = useState(false);
  const [isEventPurchasePhoto, setIsEventPurchasePhoto] = useState(false);
  const [isEventPurchaseManual, setIsEventPurchaseManual] = useState(false);

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
      const updated = { ...items[index], ...value };
      if (('unitPrice' in value || 'quantity' in value) && updated.unitPrice !== 0) {
        updated.amount = updated.quantity * updated.unitPrice;
      }
      items[index] = updated;
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
      const updated = { ...items[index], ...value };
      if (('unitPrice' in value || 'quantity' in value) && updated.unitPrice !== 0) {
        updated.amount = updated.quantity * updated.unitPrice;
      }
      items[index] = updated;
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
        isEvent: isEventPurchasePhoto,
      });
      setSaveSuccess('✅ 저장 완료!');
      setEditableResult(null);
      setReceiptFile(null);
      setIsEventPurchasePhoto(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setSavingPhoto(false);
    }
  }

  function handleVendorChange(value: string) {
    setManualRecord(r => ({ ...r, vendorName: value }));
    if (vendorDebounce.current) clearTimeout(vendorDebounce.current);
    if (!value.trim()) { setVendorSuggestions([]); setShowVendorSug(false); return; }
    vendorDebounce.current = setTimeout(async () => {
      const res = await fetch(`/api/purchases/autocomplete?q=${encodeURIComponent(value)}&type=vendor`);
      const json = await res.json().catch(() => ({}));
      const sug: string[] = json.suggestions ?? [];
      setVendorSuggestions(sug);
      setShowVendorSug(sug.length > 0);
    }, 200);
  }

  function handleItemNameChange(index: number, value: string) {
    updateManualItem(index, { name: value });
    if (itemDebounce.current) clearTimeout(itemDebounce.current);
    if (!value.trim()) { setItemSuggestions(prev => ({ ...prev, [index]: [] })); setActiveItemIdx(null); return; }
    itemDebounce.current = setTimeout(async () => {
      const res = await fetch(`/api/purchases/autocomplete?q=${encodeURIComponent(value)}&type=item`);
      const json = await res.json().catch(() => ({}));
      const sug: string[] = json.suggestions ?? [];
      setItemSuggestions(prev => ({ ...prev, [index]: sug }));
      setActiveItemIdx(sug.length > 0 ? index : null);
    }, 200);
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
        memo,
        inputMethod: 'manual',
        isEvent: isEventPurchaseManual,
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
      setMemo('');
      setIsEventPurchaseManual(false);
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">매입 내역</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 rounded-full px-3 py-1">
                    {filteredPurchaseHistory.length}건 · 합계 {(historySumAmount / 10000).toFixed(1)}만원
                  </span>
                  <button
                    type="button"
                    onClick={fetchHistory}
                    disabled={historyLoading}
                    className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40"
                  >
                    새로고침
                  </button>
                </div>
              </div>

              <PeriodSelector
                value={historyPeriodValue}
                onChange={setHistoryPeriodValue}
                availableMonths={availableMonths}
              />

              {historyLoading && (
                <p className="text-sm text-slate-400 animate-pulse text-center py-6">불러오는 중...</p>
              )}

              {historyError && (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
                  {historyError}
                </div>
              )}

              {!historyLoading && !historyError && filteredPurchaseHistory.length === 0 && (
                <div className="py-12 text-center text-slate-500 text-sm border border-dashed border-slate-800 rounded-2xl">
                  선택한 기간에 등록된 매입 내역이 없습니다.
                </div>
              )}

              {!historyLoading && !historyError && filteredPurchaseHistory.length > 0 && (
                <div className="space-y-2">
                  {filteredPurchaseHistory.map((record) => {
                    const isExpanded = expandedId === record.id;
                    const draft = draftItems[record.id] ?? record.items;
                    const itemCount = record.items?.length ?? 0;

                    return (
                      <div key={record.id} className="rounded-2xl border border-slate-800 bg-slate-950/60">
                        {/* Header row — tap to expand + delete button */}
                        <div className="flex items-start gap-0">
                          <button
                            type="button"
                            onClick={() => toggleExpand(record)}
                            className="flex-1 px-4 py-3 text-left min-w-0"
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
                            {record.memo ? (
                              <p className="mt-1 text-xs text-slate-400 truncate">📝 {record.memo}</p>
                            ) : record.note ? (
                              <p className="mt-1 text-xs text-slate-500 truncate">{record.note}</p>
                            ) : null}
                          </button>
                          {/* 삭제 버튼 */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(record.id); }}
                            className="shrink-0 px-3 py-3 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-tr-2xl transition"
                          >
                            🗑
                          </button>
                        </div>

                        {/* Expanded — item list */}
                        {isExpanded && (
                          <div className="border-t border-slate-800 px-4 pb-4 pt-3 space-y-3">
                            <div className="space-y-3">
                              <div>
                                <p className="text-xs text-slate-500 mb-1">상호명</p>
                                <input
                                  type="text"
                                  value={draftVendorNames[record.id] ?? record.vendor_name}
                                  onChange={(e) => setDraftVendorNames((prev) => ({ ...prev, [record.id]: e.target.value }))}
                                  placeholder="상호명"
                                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <p className="text-xs text-slate-500 mb-1">날짜</p>
                                  <input
                                    type="date"
                                    value={draftDates[record.id] ?? record.date}
                                    onChange={(e) => setDraftDates((prev) => ({ ...prev, [record.id]: e.target.value }))}
                                    className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
                                  />
                                </div>
                                <div>
                                  <p className="text-xs text-slate-500 mb-1">총 금액</p>
                                  <input
                                    type="number"
                                    value={draft.length > 0 ? draft.reduce((s, i) => s + i.amount, 0) : (draftTotalAmounts[record.id] ?? record.total_amount)}
                                    onChange={(e) => setDraftTotalAmounts((prev) => ({ ...prev, [record.id]: Number(e.target.value) }))}
                                    disabled={draft.length > 0}
                                    className={`w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100 ${draft.length > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  />
                                </div>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500 mb-1">메모 (선택)</p>
                                <input
                                  type="text"
                                  value={draftMemos[record.id] ?? ''}
                                  onChange={(e) => setDraftMemos((prev) => ({ ...prev, [record.id]: e.target.value }))}
                                  placeholder="메모를 입력하세요"
                                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
                                />
                              </div>
                            </div>
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
                                <div className="grid gap-2" style={{ gridTemplateColumns: '2rem 1.4fr 1.8fr' }}>
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
                  className="flex-1 rounded-2xl border border-slate-700 bg-slate-950/80 py-4 text-sm font-medium text-slate-100 hover:bg-slate-900 hover:border-slate-600 active:scale-[0.98] transition flex items-center justify-center gap-2 text-center cursor-pointer"
                >
                  <span>📷</span>
                  <span>사진 촬영</span>
                </button>
                <label
                  htmlFor="purchase-gallery-input"
                  className="flex-1 rounded-2xl border border-slate-700 bg-slate-950/80 py-4 text-sm font-medium text-slate-100 hover:bg-slate-900 hover:border-slate-600 active:scale-[0.98] transition flex items-center justify-center gap-2 text-center cursor-pointer"
                >
                  <span>🖼️</span>
                  <span>갤러리에서 선택</span>
                </label>
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 text-xs text-slate-400 leading-relaxed flex items-start gap-2">
                <span className="shrink-0 text-slate-400">💡</span>
                <span>
                  짧은 영수증은 바로 촬영해도 됩니다. 영수증이 길거나 구겨졌다면 폰의 <strong className="font-medium text-slate-300">&apos;문서 스캔&apos;</strong>을 권장합니다.
                </span>
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
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-400">구매처</label>
                        {editableResult.vendorCorrected && (
                          <span className="text-[10px] font-bold bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded animate-pulse">
                            교정됨
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={editableResult.vendorName}
                        onChange={(e) => setEditableResult((c) => c ? { ...c, vendorName: e.target.value, vendorCorrected: false } : c)}
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
                    <div>
                      <label className="text-xs text-slate-400">메모 (선택)</label>
                      <input
                        type="text"
                        value={editableResult.memo ?? ''}
                        onChange={(e) => setEditableResult((c) => c ? { ...c, memo: e.target.value } : c)}
                        placeholder="예) 맹호부대 행사, 긴급 추가 발주"
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
                            <p className="text-xs text-slate-500 font-medium">품목 {index + 1}</p>
                            <button
                              type="button"
                              onClick={() => deleteEditableItem(index)}
                              className="text-xs text-rose-400 hover:text-rose-300"
                            >
                              삭제
                            </button>
                          </div>
                          <div className="relative">
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => handlePhotoItemNameChange(index, e.target.value)}
                              onKeyDown={handlePhotoItemKeyDown(index)}
                              onFocus={() => (photoItemSuggestions[index]?.length ?? 0) > 0 && setActivePhotoItemIdx(index)}
                              onBlur={() => setTimeout(() => setActivePhotoItemIdx(null), 150)}
                              placeholder="품목명"
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
                            />
                            {activePhotoItemIdx === index && (photoItemSuggestions[index]?.length ?? 0) > 0 && (
                              <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border border-slate-700 bg-slate-900 shadow-xl overflow-hidden">
                                {photoItemSuggestions[index].map((s) => (
                                  <button
                                    key={s}
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); updateEditableItem(index, { name: s }); setActivePhotoItemIdx(null); }}
                                    className="w-full px-3 py-2 text-sm text-left text-slate-100 hover:bg-slate-800 active:bg-slate-700"
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="grid gap-2" style={{ gridTemplateColumns: '2rem 1.4fr 1.8fr' }}>
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
                              <p className="text-xs text-slate-500 mb-1">단가</p>
                              <NumericTextInput
                                value={item.unitPrice}
                                onChange={(n) => updateEditableItem(index, { unitPrice: n })}
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

                  {/* 행사 매입 토글 */}
                  <button
                    type="button"
                    onClick={() => setIsEventPurchasePhoto((v) => !v)}
                    className={`flex items-center gap-2 w-full rounded-xl px-4 py-3 text-sm font-medium transition ${
                      isEventPurchasePhoto
                        ? 'bg-purple-500/20 border border-purple-500/40 text-purple-300'
                        : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-lg">🎪</span>
                    <span>행사 매입</span>
                    <span className={`ml-auto text-xs font-bold ${isEventPurchasePhoto ? 'text-purple-300' : 'text-slate-600'}`}>
                      {isEventPurchasePhoto ? 'ON' : 'OFF'}
                    </span>
                    <span className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${
                      isEventPurchasePhoto ? 'bg-purple-500' : 'bg-slate-700'
                    }`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                        isEventPurchasePhoto ? 'left-5' : 'left-0.5'
                      }`} />
                    </span>
                  </button>

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
                  <div className="relative mt-2">
                    <input
                      type="text"
                      value={manualRecord.vendorName}
                      onChange={(e) => handleVendorChange(e.target.value)}
                      onKeyDown={handleVendorKeyDown}
                      onFocus={() => vendorSuggestions.length > 0 && setShowVendorSug(true)}
                      onBlur={() => setTimeout(() => setShowVendorSug(false), 150)}
                      placeholder="예) 홈플러스"
                      className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 p-3 text-base text-slate-100"
                    />
                    {showVendorSug && vendorSuggestions.length > 0 && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border border-slate-700 bg-slate-900 shadow-xl overflow-hidden">
                        {vendorSuggestions.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); setManualRecord(r => ({ ...r, vendorName: s })); setShowVendorSug(false); }}
                            className="w-full px-4 py-2.5 text-sm text-left text-slate-100 hover:bg-slate-800 active:bg-slate-700"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
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
                    <div key={index} className="rounded-xl border border-slate-800 bg-slate-900 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">품목 {index + 1}</span>
                        <button
                          type="button"
                          onClick={() => deleteManualItem(index)}
                          className="text-xs text-rose-400 hover:text-rose-300"
                        >
                          삭제
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleItemNameChange(index, e.target.value)}
                          onKeyDown={handleItemKeyDown(index)}
                          onFocus={() => (itemSuggestions[index]?.length ?? 0) > 0 && setActiveItemIdx(index)}
                          onBlur={() => setTimeout(() => setActiveItemIdx(null), 150)}
                          placeholder="품목명"
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
                        />
                        {activeItemIdx === index && (itemSuggestions[index]?.length ?? 0) > 0 && (
                          <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border border-slate-700 bg-slate-900 shadow-xl overflow-hidden">
                            {itemSuggestions[index].map((s) => (
                              <button
                                key={s}
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); updateManualItem(index, { name: s }); setActiveItemIdx(null); }}
                                className="w-full px-3 py-2 text-sm text-left text-slate-100 hover:bg-slate-800 active:bg-slate-700"
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="grid gap-2" style={{ gridTemplateColumns: '2rem 1.4fr 1.8fr' }}>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">수량</p>
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateManualItem(index, { quantity: Number(e.target.value) })}
                            onFocus={(e) => e.target.select()}
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
                          />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">단가</p>
                          <NumericTextInput
                            value={item.unitPrice}
                            onChange={(n) => updateManualItem(index, { unitPrice: n })}
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
                          />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">금액</p>
                          <NumericTextInput
                            value={item.amount}
                            onChange={(n) => updateManualItem(index, { amount: n })}
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
                          />
                        </div>
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

              {/* 행사 매입 토글 */}
              <button
                type="button"
                onClick={() => setIsEventPurchaseManual((v) => !v)}
                className={`flex items-center gap-2 w-full rounded-xl px-4 py-3 text-sm font-medium transition ${
                  isEventPurchaseManual
                    ? 'bg-purple-500/20 border border-purple-500/40 text-purple-300'
                    : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="text-lg">🎪</span>
                <span>행사 매입</span>
                <span className={`ml-auto text-xs font-bold ${isEventPurchaseManual ? 'text-purple-300' : 'text-slate-600'}`}>
                  {isEventPurchaseManual ? 'ON' : 'OFF'}
                </span>
                <span className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${
                  isEventPurchaseManual ? 'bg-purple-500' : 'bg-slate-700'
                }`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                    isEventPurchaseManual ? 'left-5' : 'left-0.5'
                  }`} />
                </span>
              </button>

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

      {/* 삭제 확인 팝업 */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          {/* 배경 오버레이 */}
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setConfirmDeleteId(null)}
          />
          {/* 팝업 카드 */}
          <div className="relative w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900 p-6 space-y-5 shadow-2xl">
            <div className="text-center space-y-2">
              <p className="text-3xl">🗑️</p>
              <p className="text-base font-semibold text-slate-100">정말 삭제하시겠어요?</p>
              <p className="text-sm text-slate-400">삭제한 매입 내역은 복구할 수 없습니다.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-2xl border border-slate-700 bg-slate-800 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => deleteRecord(confirmDeleteId)}
                disabled={deletingId === confirmDeleteId}
                className="rounded-2xl bg-rose-500 py-3 text-sm font-semibold text-white hover:bg-rose-400 disabled:opacity-50 transition"
              >
                {deletingId === confirmDeleteId ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
