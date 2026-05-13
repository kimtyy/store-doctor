'use client';

import { useMemo, useState } from 'react';
import { PurchaseCategory, PurchaseRecord, PurchaseItem } from '../../types/purchase';
import CameraModal from '../../components/ui/CameraModal';
import { compressImage } from '../../lib/compressImage';

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

async function savePurchase(record: PurchaseRecord & { note?: string }): Promise<void> {
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
  if (!response.ok) {
    throw new Error(body.error || `서버 오류 (${response.status})`);
  }
  if (!body.success) {
    throw new Error('저장 결과를 확인할 수 없습니다.');
  }
}

export default function PurchasesInputPage() {
  const [activeTab, setActiveTab] = useState<'photo' | 'manual'>('photo');

  // 사진 탭
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<PurchaseRecord | null>(null);
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

  const totalAmount = useMemo(
    () => manualRecord.items.reduce((sum, item) => sum + item.amount, 0),
    [manualRecord.items]
  );

  function updateItem(index: number, value: Partial<PurchaseItem>) {
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

  function deleteItem(index: number) {
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
    setLoadingParse(true);

    try {
      const dataUrl = await compressImage(receiptFile);
      const response = await fetch('/api/parse/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: [dataUrl] }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? '파싱에 실패했습니다.');
      }
      setParseResult(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoadingParse(false);
    }
  }

  async function handleSavePhoto() {
    if (!parseResult) {
      setError('저장할 매입 데이터가 없습니다.');
      return;
    }
    setError(null);
    setSaveSuccess(null);
    setSavingPhoto(true);

    try {
      await savePurchase({ ...parseResult, inputMethod: 'receipt_photo' });
      setSaveSuccess('✅ 저장 완료!');
      setParseResult(null);
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
        totalAmount,
        netAmount: totalAmount,
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
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-6 pb-32">
      <CameraModal
        isOpen={purchaseCameraOpen}
        onCapture={(file) => setReceiptFile(file)}
        onClose={() => setPurchaseCameraOpen(false)}
        galleryInputId="purchase-gallery-input"
      />
      {/* 갤러리 input — label/htmlFor 로 트리거 */}
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
            className={`flex-1 rounded-xl py-3 text-base font-semibold transition ${
              activeTab === 'photo' ? 'bg-slate-800 text-white' : 'bg-transparent text-slate-400'
            }`}
          >
            📷 사진
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`flex-1 rounded-xl py-3 text-base font-semibold transition ${
              activeTab === 'manual' ? 'bg-slate-800 text-white' : 'bg-transparent text-slate-400'
            }`}
          >
            ✏️  수동
          </button>
        </div>

        {activeTab === 'photo' ? (
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

            {parseResult ? (
              <div className="rounded-2xl bg-slate-950/80 p-5 space-y-3">
                <p className="text-xs font-medium text-slate-400">파싱 결과</p>
                <p className="font-medium text-slate-100">{parseResult.vendorName}</p>
                <p className="text-2xl font-bold text-emerald-400">{parseResult.totalAmount.toLocaleString()}원</p>
                <p className="text-xs text-slate-400">카테고리: {categoryLabels[parseResult.category]}</p>
                <button
                  type="button"
                  onClick={handleSavePhoto}
                  disabled={savingPhoto}
                  className="w-full rounded-2xl bg-slate-800 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingPhoto ? '저장 중...' : '저장하기'}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 space-y-4">
            <h2 className="text-lg font-semibold">빠른 수동 입력</h2>

            {/* 기본 정보 */}
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-slate-300">구매처</label>
                <input
                  type="text"
                  value={manualRecord.vendorName}
                  onChange={(event) => setManualRecord({ ...manualRecord, vendorName: event.target.value })}
                  placeholder="예) 홈플러스"
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 p-3 text-base"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-300">일자</label>
                <input
                  type="date"
                  value={manualRecord.date}
                  onChange={(event) => setManualRecord({ ...manualRecord, date: event.target.value })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 p-3 text-base"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-300">카테고리</label>
                <select
                  value={manualRecord.category}
                  onChange={(event) => setManualRecord({ ...manualRecord, category: event.target.value as PurchaseCategory })}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 p-3 text-base"
                >
                  {categoryOptions.map((cat) => (
                    <option key={cat} value={cat}>
                      {categoryLabels[cat]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-300">메모 (선택)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="예) 시장 생선 50만원"
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/80 p-3 text-base"
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
                        onClick={() => deleteItem(index)}
                        className="text-xs text-rose-400 hover:text-rose-300"
                      >
                        삭제
                      </button>
                    </div>
                    <input
                      type="text"
                      value={item.name}
                      onChange={(event) => updateItem(index, { name: event.target.value })}
                      placeholder="품목명"
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })}
                        placeholder="수량"
                        className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm"
                      />
                      <input
                        type="number"
                        min={0}
                        value={item.unitPrice}
                        onChange={(event) => updateItem(index, { unitPrice: Number(event.target.value) })}
                        placeholder="단가"
                        className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm"
                      />
                      <input
                        type="number"
                        min={0}
                        value={item.amount}
                        onChange={(event) => updateItem(index, { amount: Number(event.target.value) })}
                        placeholder="금액"
                        className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 합계 */}
            <div className="rounded-2xl bg-slate-950/80 p-5 border border-slate-800">
              <p className="text-xs text-slate-400">합계</p>
              <p className="mt-2 text-3xl font-bold text-emerald-400">{totalAmount.toLocaleString()}원</p>
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
  );
}
