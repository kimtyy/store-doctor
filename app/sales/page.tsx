'use client';

import { useState } from 'react';
import { DailySales, SalesMenuItem } from '../../types/sales';

interface ParseResult {
  receipt?: DailySales;
  menu?: { date?: string; menuItems: SalesMenuItem[] };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('파일을 읽을 수 없습니다.'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function SalesInputPage() {
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [menuFile, setMenuFile] = useState<File | null>(null);
  const [result, setResult] = useState<ParseResult>({});
  const [error, setError] = useState<string | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [loadingMenu, setLoadingMenu] = useState(false);

  async function handleReceiptParse() {
    if (!receiptFile) {
      setError('POS 마감 정산서 사진을 선택해주세요.');
      return;
    }
    setError(null);
    setLoadingReceipt(true);

    try {
      const dataUrl = await fileToDataUrl(receiptFile);
      const response = await fetch('/api/parse/pos-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: [dataUrl] }),
      });

      // 응답이 비어있는지 먼저 확인
      const responseText = await response.text();

      if (!responseText || responseText.trim() === '') {
        throw new Error('서버로부터 빈 응답을 받았습니다. 잠시 후 다시 시도해주세요.');
      }

      let body;
      try {
        body = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON 파싱 에러:', parseError, '응답 텍스트:', responseText);
        throw new Error('서버 응답을 처리할 수 없습니다. 다시 시도해주세요.');
      }

      if (!response.ok) {
        const errorMessage = body.error || `서버 오류 (${response.status})`;
        throw new Error(errorMessage);
      }

      if (!body.data) {
        throw new Error('파싱 결과를 받지 못했습니다. 다른 사진으로 시도해주세요.');
      }

      setResult((current) => ({ ...current, receipt: body.data }));
    } catch (err) {
      console.error('Receipt parsing error:', err);
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
      const dataUrl = await fileToDataUrl(menuFile);
      const response = await fetch('/api/parse/menu-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: [dataUrl] }),
      });

      // 응답이 비어있는지 먼저 확인
      const responseText = await response.text();

      if (!responseText || responseText.trim() === '') {
        throw new Error('서버로부터 빈 응답을 받았습니다. 잠시 후 다시 시도해주세요.');
      }

      let body;
      try {
        body = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON 파싱 에러:', parseError, '응답 텍스트:', responseText);
        throw new Error('서버 응답을 처리할 수 없습니다. 다시 시도해주세요.');
      }

      if (!response.ok) {
        const errorMessage = body.error || `서버 오류 (${response.status})`;
        throw new Error(errorMessage);
      }

      if (!body.data) {
        throw new Error('파싱 결과를 받지 못했습니다. 다른 사진으로 시도해주세요.');
      }

      setResult((current) => ({ ...current, menu: body.data }));
    } catch (err) {
      console.error('Menu parsing error:', err);
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoadingMenu(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-6 pb-32">
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">매출 입력</h1>
          <p className="mt-2 text-sm text-slate-400">POS 영수증 2장을 촬영하세요</p>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>
        ) : null}

        {/* 정산서 입력 */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
          <h2 className="text-lg font-semibold text-slate-100">① POS 마감 정산서</h2>
          <p className="mt-2 text-xs text-slate-400">총매출, 현금/카드 구분 내용</p>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
            className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-950/80 p-4 text-sm text-slate-100"
          />
          <button
            type="button"
            onClick={handleReceiptParse}
            disabled={loadingReceipt || !receiptFile}
            className="mt-4 w-full rounded-2xl bg-sky-500 px-6 py-4 text-base font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingReceipt ? '파싱 중...' : '정산서 파싱'}
          </button>
        </div>

        {/* 메뉴별 매출 입력 */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
          <h2 className="text-lg font-semibold text-slate-100">② 메뉴별 매출 내역</h2>
          <p className="mt-2 text-xs text-slate-400">메뉴명, 수량, 금액</p>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => setMenuFile(event.target.files?.[0] ?? null)}
            className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-950/80 p-4 text-sm text-slate-100"
          />
          <button
            type="button"
            onClick={handleMenuParse}
            disabled={loadingMenu || !menuFile}
            className="mt-4 w-full rounded-2xl bg-emerald-500 px-6 py-4 text-base font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingMenu ? '파싱 중...' : '메뉴 매출 파싱'}
          </button>
        </div>

        {/* 결과 미리보기 */}
        {result.receipt || result.menu ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
            <h2 className="text-lg font-semibold text-slate-100">파싱 결과</h2>

            {result.receipt ? (
              <div className="mt-4 rounded-2xl bg-slate-950/80 p-5 space-y-3">
                <p className="text-xs font-medium text-slate-400">정산서 결과</p>
                <div className="grid gap-3 grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-400">총매출</p>
                    <p className="text-xl font-bold text-slate-100">{result.receipt.totalRevenue.toLocaleString()}원</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">순매출</p>
                    <p className="text-xl font-bold text-emerald-400">{result.receipt.netRevenue.toLocaleString()}원</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">현금</p>
                    <p className="text-sm text-slate-300">{result.receipt.cashAmount.toLocaleString()}원</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">카드</p>
                    <p className="text-sm text-slate-300">{result.receipt.cardAmount.toLocaleString()}원</p>
                  </div>
                </div>
              </div>
            ) : null}

            {result.menu?.menuItems ? (
              <div className="mt-4 rounded-2xl bg-slate-950/80 p-5 space-y-3">
                <p className="text-xs font-medium text-slate-400">메뉴 결과 ({result.menu.menuItems.length}개)</p>
                <div className="space-y-2">
                  {result.menu.menuItems.slice(0, 5).map((item, idx) => (
                    <div key={`${item.name}-${idx}`} className="flex justify-between text-sm">
                      <span className="text-slate-300">{item.name}</span>
                      <span className="text-slate-100 font-medium">{item.amount.toLocaleString()}원</span>
                    </div>
                  ))}
                  {result.menu.menuItems.length > 5 ? (
                    <p className="text-xs text-slate-400 pt-2">외 {result.menu.menuItems.length - 5}개</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <button
              type="button"
              className="mt-4 w-full rounded-2xl bg-slate-800 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-700"
            >
              저장하기
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
