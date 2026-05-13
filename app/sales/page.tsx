'use client';

import { useState } from 'react';
import { DailySales, SalesMenuItem } from '../../types/sales';
import CameraModal from '../../components/ui/CameraModal';
import { compressImage } from '../../lib/compressImage';
import BottomTabNav from '../../components/BottomTabNav';

type EditableReceipt = Partial<DailySales> & {
  date: string;
  totalRevenue: number;
  netRevenue: number;
  cashAmount: number;
  cardAmount: number;
};

export default function SalesInputPage() {
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [menuFile, setMenuFile] = useState<File | null>(null);

  const [editableReceipt, setEditableReceipt] = useState<EditableReceipt | null>(null);
  const [editableMenuItems, setEditableMenuItems] = useState<SalesMenuItem[]>([]);
  const [menuParsed, setMenuParsed] = useState(false);
  const [menuDate, setMenuDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [savingMenu, setSavingMenu] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [receiptCameraOpen, setReceiptCameraOpen] = useState(false);
  const [menuCameraOpen, setMenuCameraOpen] = useState(false);

  function updateMenuItem(index: number, value: Partial<SalesMenuItem>) {
    setEditableMenuItems((current) => {
      const items = [...current];
      items[index] = { ...items[index], ...value };
      return items;
    });
  }

  function addMenuItem() {
    setEditableMenuItems((current) => [...current, { name: '', quantity: 1, amount: 0 }]);
  }

  function deleteMenuItem(index: number) {
    setEditableMenuItems((current) => current.filter((_, i) => i !== index));
  }

  async function handleReceiptParse() {
    if (!receiptFile) {
      setError('POS 마감 정산서 사진을 선택해주세요.');
      return;
    }
    setError(null);
    setLoadingReceipt(true);

    try {
      const dataUrl = await compressImage(receiptFile);
      const response = await fetch('/api/parse/pos-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: [dataUrl] }),
      });

      const responseText = await response.text();
      if (!responseText || responseText.trim() === '') {
        throw new Error('서버로부터 빈 응답을 받았습니다. 잠시 후 다시 시도해주세요.');
      }

      let body;
      try { body = JSON.parse(responseText); } catch {
        throw new Error('서버 응답을 처리할 수 없습니다. 다시 시도해주세요.');
      }

      if (!response.ok) throw new Error(body.error || `서버 오류 (${response.status})`);
      if (!body.data) throw new Error('파싱 결과를 받지 못했습니다. 다른 사진으로 시도해주세요.');

      const parsed = body.data as DailySales;
      setEditableReceipt({
        date: parsed.date ?? new Date().toISOString().split('T')[0],
        totalRevenue: parsed.totalRevenue ?? 0,
        discount: parsed.discount ?? 0,
        serviceCharge: parsed.serviceCharge ?? 0,
        serviceAmount: parsed.serviceAmount ?? parsed.serviceCharge ?? 0,
        actualSales: parsed.actualSales ?? ((parsed.totalRevenue ?? 0) - (parsed.serviceAmount ?? parsed.serviceCharge ?? 0)),
        tax: parsed.tax ?? 0,
        netRevenue: parsed.netRevenue ?? 0,
        cashCount: parsed.cashCount ?? 0,
        cashAmount: parsed.cashAmount ?? 0,
        cardCount: parsed.cardCount ?? 0,
        cardAmount: parsed.cardAmount ?? 0,
        tablesUsed: parsed.tablesUsed ?? 0,
        guestCount: parsed.guestCount ?? 0,
        avgSpend: parsed.avgSpend ?? 0,
        openTime: parsed.openTime ?? '',
        closeTime: parsed.closeTime ?? '',
        firstOrderTime: parsed.firstOrderTime ?? '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoadingReceipt(false);
    }
  }

  async function handleMenuParse() {
    if (!menuFile) {
      setError('메뉴별 매출 내역 사진을 선택해주세요.');
      return;
    }
    setError(null);
    setLoadingMenu(true);

    try {
      const dataUrl = await compressImage(menuFile);
      const response = await fetch('/api/parse/menu-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: [dataUrl] }),
      });

      const responseText = await response.text();
      if (!responseText || responseText.trim() === '') {
        throw new Error('서버로부터 빈 응답을 받았습니다. 잠시 후 다시 시도해주세요.');
      }

      let body;
      try { body = JSON.parse(responseText); } catch {
        throw new Error('서버 응답을 처리할 수 없습니다. 다시 시도해주세요.');
      }

      if (!response.ok) throw new Error(body.error || `서버 오류 (${response.status})`);
      if (!body.data) throw new Error('파싱 결과를 받지 못했습니다. 다른 사진으로 시도해주세요.');

      setEditableMenuItems(body.data.menuItems ?? []);
      setMenuParsed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoadingMenu(false);
    }
  }

  async function handleSave(successMessage?: string) {
    if (!editableReceipt) {
      setError('먼저 ① 정산서를 파싱해주세요.');
      return;
    }

    setError(null);
    setSaveSuccess(null);
    setSaving(true);

    try {
      const response = await fetch('/api/sales/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipt: editableReceipt,
          menu: menuParsed ? { menuItems: editableMenuItems } : undefined,
        }),
      });

      const responseText = await response.text();
      if (!responseText || responseText.trim() === '') {
        throw new Error('서버로부터 빈 응답을 받았습니다. 잠시 후 다시 시도해주세요.');
      }

      let body;
      try { body = JSON.parse(responseText); } catch {
        throw new Error('서버 응답을 처리할 수 없습니다. 다시 시도해주세요.');
      }

      if (!response.ok) throw new Error(body.error || body.details || `서버 오류 (${response.status})`);
      if (body.success) {
        setSaveSuccess(successMessage ?? body.message ?? '✅ 저장 완료!');
        setEditableReceipt(null);
        setEditableMenuItems([]);
        setMenuParsed(false);
        setReceiptFile(null);
        setMenuFile(null);
      } else {
        throw new Error('저장 결과를 확인할 수 없습니다.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMenuOnly() {
    if (editableMenuItems.length === 0) {
      setError('저장할 메뉴 항목이 없습니다.');
      return;
    }
    setError(null);
    setSaveSuccess(null);
    setSavingMenu(true);

    try {
      const response = await fetch('/api/sales/save-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: menuDate, menuItems: editableMenuItems }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || `서버 오류 (${response.status})`);
      if (!body?.success) throw new Error('저장 결과를 확인할 수 없습니다.');

      setSaveSuccess(body.message ?? '✅ 메뉴 저장 완료!');
      setEditableMenuItems([]);
      setMenuParsed(false);
      setMenuFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setSavingMenu(false);
    }
  }

  const btnBase =
    'flex-1 rounded-2xl border border-slate-700 bg-slate-950/80 py-4 text-sm font-medium text-slate-100 hover:bg-slate-900 transition text-center cursor-pointer';

  return (
    <>
      <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-6 pb-32">
        {/* 카메라 모달 */}
        <CameraModal
          isOpen={receiptCameraOpen}
          onCapture={(file) => setReceiptFile(file)}
          onClose={() => setReceiptCameraOpen(false)}
          galleryInputId="receipt-gallery-input"
        />
        <CameraModal
          isOpen={menuCameraOpen}
          onCapture={(file) => setMenuFile(file)}
          onClose={() => setMenuCameraOpen(false)}
          galleryInputId="menu-gallery-input"
        />

        <input
          id="receipt-gallery-input"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
        />
        <input
          id="menu-gallery-input"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => setMenuFile(e.target.files?.[0] ?? null)}
        />

        <div className="max-w-2xl space-y-6">
          <div>
            <h1 className="text-3xl font-bold">매출 입력</h1>
            <p className="mt-2 text-sm text-slate-400">POS 영수증 2장을 촬영하세요</p>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>
          ) : null}

          {saveSuccess ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{saveSuccess}</div>
          ) : null}

          {/* ① 정산서 */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">① POS 마감 정산서</h2>
              <p className="mt-1 text-xs text-slate-400">총매출, 현금/카드 구분 내용</p>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setReceiptCameraOpen(true)} className={btnBase}>
                📷 사진 찍기
              </button>
              <label htmlFor="receipt-gallery-input" className={btnBase}>
                🖼️ 갤러리에서 선택
              </label>
            </div>

            {receiptFile ? (
              <p className="text-xs text-slate-400 truncate">선택됨: {receiptFile.name}</p>
            ) : null}

            <button
              type="button"
              onClick={handleReceiptParse}
              disabled={loadingReceipt || !receiptFile}
              className="w-full rounded-2xl bg-sky-500 px-6 py-4 text-base font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingReceipt ? '파싱 중...' : '정산서 파싱'}
            </button>

            {/* 정산서 결과 편집 */}
            {editableReceipt ? (
              <div className="rounded-2xl bg-slate-950/80 p-5 space-y-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">정산서 결과 — 수정 가능</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400">날짜</label>
                    <input
                      type="date"
                      value={editableReceipt.date}
                      onChange={(e) => setEditableReceipt((c) => c ? { ...c, date: e.target.value } : c)}
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-sm text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">총매출</label>
                    <input
                      type="number"
                      value={editableReceipt.totalRevenue}
                      onChange={(e) => setEditableReceipt((c) => c ? { ...c, totalRevenue: Number(e.target.value) } : c)}
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-sm text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">서비스금액</label>
                    <input
                      type="number"
                      value={editableReceipt.serviceAmount ?? 0}
                      onChange={(e) => setEditableReceipt((c) => c ? { ...c, serviceAmount: Number(e.target.value) } : c)}
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-sm text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">매출금액</label>
                    <input
                      type="number"
                      value={editableReceipt.actualSales ?? 0}
                      onChange={(e) => setEditableReceipt((c) => c ? { ...c, actualSales: Number(e.target.value) } : c)}
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-sm text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">순매출</label>
                    <input
                      type="number"
                      value={editableReceipt.netRevenue}
                      onChange={(e) => setEditableReceipt((c) => c ? { ...c, netRevenue: Number(e.target.value) } : c)}
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-sm text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">부가세</label>
                    <input
                      type="number"
                      value={editableReceipt.tax ?? 0}
                      onChange={(e) => setEditableReceipt((c) => c ? { ...c, tax: Number(e.target.value) } : c)}
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-sm text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">현금</label>
                    <input
                      type="number"
                      value={editableReceipt.cashAmount}
                      onChange={(e) => setEditableReceipt((c) => c ? { ...c, cashAmount: Number(e.target.value) } : c)}
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-sm text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">카드</label>
                    <input
                      type="number"
                      value={editableReceipt.cardAmount}
                      onChange={(e) => setEditableReceipt((c) => c ? { ...c, cardAmount: Number(e.target.value) } : c)}
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-sm text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">고객수</label>
                    <input
                      type="number"
                      value={editableReceipt.guestCount ?? 0}
                      onChange={(e) => setEditableReceipt((c) => c ? { ...c, guestCount: Number(e.target.value) } : c)}
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-sm text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">객단가</label>
                    <input
                      type="number"
                      value={editableReceipt.avgSpend ?? 0}
                      onChange={(e) => setEditableReceipt((c) => c ? { ...c, avgSpend: Number(e.target.value) } : c)}
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-sm text-slate-100"
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* ② 메뉴별 매출 */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">② 메뉴별 매출 내역</h2>
              <p className="mt-1 text-xs text-slate-400">메뉴명, 수량, 금액 (선택)</p>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setMenuCameraOpen(true)} className={btnBase}>
                📷 사진 찍기
              </button>
              <label htmlFor="menu-gallery-input" className={btnBase}>
                🖼️ 갤러리에서 선택
              </label>
            </div>

            {menuFile ? (
              <p className="text-xs text-slate-400 truncate">선택됨: {menuFile.name}</p>
            ) : null}

            <button
              type="button"
              onClick={handleMenuParse}
              disabled={loadingMenu || !menuFile}
              className="w-full rounded-2xl bg-emerald-500 px-6 py-4 text-base font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingMenu ? '파싱 중...' : '메뉴 매출 파싱'}
            </button>

            {/* 메뉴 결과 편집 */}
            {menuParsed ? (
              <div className="rounded-2xl bg-slate-950/80 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    메뉴 결과 — {editableMenuItems.length}개
                  </p>
                  <button
                    type="button"
                    onClick={addMenuItem}
                    className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-600"
                  >
                    + 추가
                  </button>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {editableMenuItems.map((item, index) => (
                    <div key={index} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-xs text-slate-500">{index + 1}</p>
                        <button
                          type="button"
                          onClick={() => deleteMenuItem(index)}
                          className="text-xs text-rose-400 hover:text-rose-300"
                        >
                          삭제
                        </button>
                      </div>
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateMenuItem(index, { name: e.target.value })}
                        placeholder="메뉴명"
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100 mb-2"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-xs text-slate-500 mb-1">수량</p>
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateMenuItem(index, { quantity: Number(e.target.value) })}
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
                          />
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">금액</p>
                          <input
                            type="number"
                            min={0}
                            value={item.amount}
                            onChange={(e) => updateMenuItem(index, { amount: Number(e.target.value) })}
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl bg-slate-900/80 p-3 border border-slate-800 flex justify-between items-center">
                  <p className="text-xs text-slate-400">메뉴 합계</p>
                  <p className="font-bold text-emerald-400">
                    {editableMenuItems.reduce((s, i) => s + i.amount, 0).toLocaleString()}원
                  </p>
                </div>

                {/* 정산서 없을 때: 날짜 선택 후 메뉴 단독 저장 */}
                {!editableReceipt ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-slate-400">저장할 날짜</label>
                      <input
                        type="date"
                        value={menuDate}
                        onChange={(e) => setMenuDate(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-sm text-slate-100"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveMenuOnly}
                      disabled={savingMenu}
                      className="w-full rounded-2xl bg-emerald-600 px-6 py-4 text-base font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingMenu ? '저장 중...' : `메뉴 저장하기 (${editableMenuItems.length}개)`}
                    </button>
                  </div>
                ) : (
                  /* 정산서 있을 때: 정산서+메뉴 통합 저장 */
                  <button
                    type="button"
                    onClick={() => handleSave('✅ 메뉴 저장 완료!')}
                    disabled={saving}
                    className="w-full rounded-2xl bg-emerald-600 px-6 py-4 text-base font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? '저장 중...' : `메뉴 저장하기 (${editableMenuItems.length}개)`}
                  </button>
                )}
              </div>
            ) : null}
          </div>

          {/* 저장 버튼 */}
          {editableReceipt ? (
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={saving}
              className="w-full rounded-2xl bg-slate-800 px-6 py-4 text-base font-semibold text-slate-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? '저장 중...'
                : menuParsed
                ? `저장하기 (메뉴 ${editableMenuItems.length}개 포함)`
                : '저장하기'}
            </button>
          ) : null}
        </div>
      </main>

      <BottomTabNav />
    </>
  );
}
