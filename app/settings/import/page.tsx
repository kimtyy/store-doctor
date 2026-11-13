'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import BottomTabNav from '@/components/BottomTabNav';

interface ImportBatch {
  id: string;
  store_id: string;
  source: string;
  year_month: string;
  file_name: string;
  days_written: number;
  menu_rows: number;
  total_amount: number;
  mode: 'fill' | 'overwrite';
  created_at: string;
  undone_at: string | null;
}

interface ConflictingDay {
  date: string;
  appNetRevenue: number;
  fileNetRevenue: number;
  diffAmount: number;
  diffPercent: number;
}

interface PreviewData {
  yearMonth: string;
  fileName: string;
  fileSha256: string;
  isDuplicateFile: boolean;
  duplicateBatchInfo?: {
    id: string;
    year_month: string;
    file_name: string;
    created_at: string;
  } | null;
  totalAmount: number;
  netRevenue: number;
  tax: number;
  menuCount: number;
  openDaysCount: number;
  zeroRevenueDays: string[];
  existingDaysCount: number;
  daysToInsert: number;
  daysToOverwrite: number;
  conflictingDays: ConflictingDay[];
  newMenusCount: number;
  newMenus: string[];
}

interface QueueItem {
  file: File;
  yearMonth: string;
  preview?: PreviewData;
  error?: string;
  loading?: boolean;
  saveStatus?: 'idle' | 'saving' | 'done' | 'failed';
  saveMessage?: string;
}

export default function OkposImportPage() {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [mode, setMode] = useState<'fill' | 'overwrite'>('fill');
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [generalMessage, setGeneralMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 최근 가져온 묶음 조회
  const loadBatches = async () => {
    setLoadingBatches(true);
    try {
      const res = await fetch('/api/import/okpos');
      const data = await res.json().catch(() => null);
      if (res.ok && data?.batches) {
        setBatches(data.batches);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingBatches(false);
    }
  };

  useEffect(() => {
    loadBatches();
  }, []);

  // 연·월 다음 달 계산 헬퍼 ('2024-01' -> '2024-02')
  const getNextMonth = (ym: string): string => {
    const m = ym.match(/^(\d{4})-(\d{2})$/);
    if (!m) return ym;
    let y = parseInt(m[1], 10);
    let month = parseInt(m[2], 10) + 1;
    if (month > 12) {
      y += 1;
      month = 1;
    }
    return `${y}-${String(month).padStart(2, '0')}`;
  };

  // 파일 선택 처리 (여러 파일 지원)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const newItems: QueueItem[] = [];

    // 기본 시작 연·월 추정 (현재 큐의 마지막 연·월 + 1, 없으면 현재 기준)
    let currentYm = queue.length > 0 ? getNextMonth(queue[queue.length - 1].yearMonth) : '2024-01';

    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      // 파일명에서 YYYY-MM 또는 YYYYMM 탐색 시도 (예: 202401, 2024-01)
      const nameMatch = f.name.match(/(20\d{2})[-_.]?(0[1-9]|1[0-2])/);
      let detectedYm = currentYm;
      if (nameMatch) {
        detectedYm = `${nameMatch[1]}-${nameMatch[2]}`;
      }

      newItems.push({
        file: f,
        yearMonth: detectedYm,
        loading: false,
        saveStatus: 'idle',
      });

      // 다음 파일 기본값은 직전 파일 연·월 + 1
      currentYm = getNextMonth(detectedYm);
    }

    setQueue((prev) => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 개별 파일 미리보기 요청
  const runPreview = async (idx: number, item: QueueItem) => {
    setQueue((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], loading: true, error: undefined };
      return next;
    });

    try {
      const fd = new FormData();
      fd.append('action', 'preview');
      fd.append('year_month', item.yearMonth);
      fd.append('file', item.file);

      const res = await fetch('/api/import/okpos', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        setQueue((prev) => {
          const next = [...prev];
          next[idx] = { ...next[idx], loading: false, error: data?.error || '미리보기 실패' };
          return next;
        });
        return;
      }

      setQueue((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], loading: false, preview: data.preview };
        return next;
      });
    } catch (err) {
      setQueue((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], loading: false, error: '서버 통신 실패' };
        return next;
      });
    }
  };

  // 연·월 변경 핸들러
  const handleYmChange = (idx: number, newYm: string) => {
    setQueue((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], yearMonth: newYm, preview: undefined, error: undefined };
      return next;
    });
  };

  // 큐 항목 삭제
  const removeQueueItem = (idx: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== idx));
  };

  // 개별 파일 저장 실행
  const runSaveItem = async (idx: number) => {
    const item = queue[idx];
    if (!item.preview) return;

    if (mode === 'overwrite') {
      const confirmMsg = `${item.yearMonth}의 기존 매출 데이터를 덮어쓰시겠습니까?\n\n⚠️ 주의: 겹치는 날짜의 기존 매출, 영수증 사진 URL, 메모, 날씨 데이터가 모두 삭제되고 이번 파일 내용으로 대체됩니다.`;
      if (!window.confirm(confirmMsg)) return;
    }

    setQueue((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], saveStatus: 'saving', saveMessage: undefined };
      return next;
    });

    try {
      const fd = new FormData();
      fd.append('action', 'save');
      fd.append('year_month', item.yearMonth);
      fd.append('mode', mode);
      fd.append('file', item.file);

      const res = await fetch('/api/import/okpos', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        setQueue((prev) => {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            saveStatus: 'failed',
            saveMessage: data?.error || '저장 실패',
          };
          return next;
        });
        return;
      }

      setQueue((prev) => {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          saveStatus: 'done',
          saveMessage: data.message,
        };
        return next;
      });

      // 묶음 목록 갱신
      await loadBatches();
    } catch (err) {
      setQueue((prev) => {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          saveStatus: 'failed',
          saveMessage: '네트워크 또는 서버 오류',
        };
        return next;
      });
    }
  };

  // 가져오기 취소 (Undo Batch)
  const handleUndoBatch = async (batch: ImportBatch) => {
    const confirmMsg = `[${batch.year_month}] 가져오기를 취소하시겠습니까?\n\n이 묶음으로 등록된 ${batch.days_written}일치의 매출 행이 모두 삭제됩니다.\n(덮어쓰기 모드로 지워졌던 기존 데이터는 복구되지 않습니다.)`;
    if (!window.confirm(confirmMsg)) return;

    setUndoingId(batch.id);
    setGeneralMessage(null);
    try {
      const res = await fetch(`/api/import/okpos?id=${batch.id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        setGeneralMessage({ type: 'error', text: data?.error || '가져오기 취소 실패' });
      } else {
        setGeneralMessage({ type: 'success', text: data.message });
        await loadBatches();
      }
    } catch (e) {
      setGeneralMessage({ type: 'error', text: '취소 요청 중 오류가 발생했습니다.' });
    } finally {
      setUndoingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-28">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Link href="/settings" className="text-xs text-slate-400 hover:text-slate-200">
                ← 설정
              </Link>
            </div>
            <h1 className="text-2xl font-extrabold text-white mt-1">과거 매출 가져오기 (OKPOS)</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              OKPOS 웹에서 다운로드한 &quot;메뉴별×일자&quot; 엑셀 파일(.xls)로 과거 몇 년치 매출을 안전하게 등록합니다.
            </p>
          </div>
        </div>

        {/* 상단 안내 카드 */}
        <div className="rounded-2xl border border-sky-900/50 bg-sky-950/20 p-4 text-xs text-sky-200 leading-relaxed space-y-1.5">
          <p className="font-bold flex items-center gap-1.5 text-sky-100 text-sm">
            <span>💡</span> 파일 준비 안내 (OKPOS 관리자 웹)
          </p>
          <p>
            1. OKPOS 관리자 웹사이트에 로그인 후 <strong>[매출 관리] → [메뉴별 매출] → [일자별]</strong> 메뉴로 이동합니다.
          </p>
          <p>
            2. 조회 기간을 <strong>한 달 단위(1일 ~ 말일)</strong>로 설정하여 조회한 뒤, 우측 상단 <strong>[엑셀 다운로드]</strong>를 클릭해 저장합니다.
          </p>
          <p className="text-sky-300">
            * 파일 안에 연·월 정보가 없으므로 파일 선택 후 연·월을 꼭 확인해 주세요. 여러 달 파일을 한 번에 선택하실 수 있습니다.
          </p>
        </div>

        {generalMessage && (
          <div
            className={`rounded-2xl border p-4 text-sm ${
              generalMessage.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
            }`}
          >
            {generalMessage.text}
          </div>
        )}

        {/* 파일 선택 및 옵션 */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center justify-between">
            <span>1. 파일 선택 및 등록 모드</span>
            <span className="text-xs font-normal text-slate-400">Claude 호출 없음 (모든 플랜 무료)</span>
          </h2>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                처리 방식 (기존 매출과 겹칠 때)
              </label>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setMode('fill')}
                  className={`p-3 rounded-xl border text-left transition ${
                    mode === 'fill'
                      ? 'border-sky-500 bg-sky-500/10 text-sky-200 font-bold'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <p className="text-sm">빈 날짜만 채우기 (기본)</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">이미 앱에 매출이 있는 날은 건너뜁니다.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('overwrite')}
                  className={`p-3 rounded-xl border text-left transition ${
                    mode === 'overwrite'
                      ? 'border-amber-500 bg-amber-500/10 text-amber-200 font-bold'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <p className="text-sm">겹치는 날도 덮어쓰기</p>
                  <p className="text-[11px] text-amber-400/80 mt-0.5">기존 영수증/메뉴를 삭제하고 파일로 대체</p>
                </button>
              </div>
            </div>

            <div className="pt-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xls,.html"
                multiple
                onChange={handleFileChange}
                className="hidden"
                id="okpos-file-input"
              />
              <label
                htmlFor="okpos-file-input"
                className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-2xl p-6 hover:border-sky-500/70 hover:bg-slate-800/40 cursor-pointer transition text-center"
              >
                <span className="text-3xl mb-1">📁</span>
                <span className="text-sm font-bold text-slate-200">OKPOS 엑셀 파일(.xls) 선택하기</span>
                <span className="text-xs text-slate-500 mt-1">한 개 또는 여러 달 파일을 한꺼번에 선택할 수 있습니다.</span>
              </label>
            </div>
          </div>
        </div>

        {/* 대기열 및 미리보기 목록 */}
        {queue.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">2. 파일 검증 및 미리보기 ({queue.length}건)</h2>
              <button
                type="button"
                onClick={() => setQueue([])}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                대기열 비우기
              </button>
            </div>

            <div className="space-y-4">
              {queue.map((item, idx) => {
                const prev = item.preview;
                return (
                  <div key={idx} className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-100 text-sm truncate">{item.file.name}</p>
                        <p className="text-xs text-slate-500">{(item.file.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-400 whitespace-nowrap">해당 연·월:</label>
                        <input
                          type="month"
                          value={item.yearMonth}
                          disabled={item.saveStatus === 'done' || item.saveStatus === 'saving'}
                          onChange={(e) => handleYmChange(idx, e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() => removeQueueItem(idx)}
                          className="text-slate-500 hover:text-slate-300 text-xs px-1"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* 검증 및 미리보기 버튼 */}
                    {!prev && !item.error && (
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-slate-400">연·월을 확인한 뒤 검증을 진행해주세요.</span>
                        <button
                          type="button"
                          disabled={item.loading}
                          onClick={() => runPreview(idx, item)}
                          className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
                        >
                          {item.loading ? '파싱 및 검증 중...' : '미리보기 검증'}
                        </button>
                      </div>
                    )}

                    {/* 오류 메시지 */}
                    {item.error && (
                      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 space-y-2">
                        <p className="font-semibold">⚠️ 검증 실패 사유:</p>
                        <p className="leading-relaxed">{item.error}</p>
                        <button
                          type="button"
                          onClick={() => runPreview(idx, item)}
                          className="px-3 py-1 bg-rose-900/60 hover:bg-rose-800 text-rose-200 rounded-lg text-xs"
                        >
                          다시 시도
                        </button>
                      </div>
                    )}

                    {/* 미리보기 결과 */}
                    {prev && (
                      <div className="space-y-3 pt-1 text-xs">
                        {prev.isDuplicateFile && (
                          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-amber-200">
                            ⚠️ 동일한 파일(SHA256 일치)이 이미 등록된 내역이 있습니다. (기존 배치:{' '}
                            {prev.duplicateBatchInfo?.year_month} / {prev.duplicateBatchInfo?.file_name})
                          </div>
                        )}

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950/70 p-3 rounded-2xl border border-slate-800/80">
                          <div>
                            <span className="text-slate-500 block">부가세 포함 합계</span>
                            <span className="font-bold text-slate-100 text-sm">
                              {prev.totalAmount.toLocaleString()}원
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">순매출 (÷1.1)</span>
                            <span className="font-bold text-sky-400 text-sm">
                              {prev.netRevenue.toLocaleString()}원
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">영업일수 / 메뉴</span>
                            <span className="font-bold text-slate-200">
                              {prev.openDaysCount}일 / {prev.menuCount}개
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">매출 0원 일수</span>
                            <span className="font-bold text-slate-400">
                              {prev.zeroRevenueDays.length}일
                            </span>
                          </div>
                        </div>

                        {/* 겹치는 날짜 및 차이 분석 */}
                        <div className="rounded-xl border border-slate-800 p-3 space-y-1 bg-slate-950/40">
                          <div className="flex justify-between text-slate-300">
                            <span>등록 예정일수:</span>
                            <span className="font-semibold text-slate-100">
                              {mode === 'fill' ? `${prev.daysToInsert}일 (기존 ${prev.existingDaysCount}일 제외)` : `${prev.openDaysCount}일 전체 (기존 ${prev.daysToOverwrite}일 덮어쓰기)`}
                            </span>
                          </div>

                          {prev.conflictingDays.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-slate-800/80">
                              <p className="text-amber-300 font-semibold mb-1">
                                ⚠️ 기존 앱 순매출과 1% 또는 1,000원 이상 차이나는 날짜 ({prev.conflictingDays.length}일):
                              </p>
                              <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                                {prev.conflictingDays.map((cd) => (
                                  <div key={cd.date} className="flex justify-between text-[11px] text-slate-400 bg-slate-900 px-2 py-1 rounded">
                                    <span>{cd.date}</span>
                                    <span>
                                      앱 {cd.appNetRevenue.toLocaleString()}원 vs 파일 {cd.fileNetRevenue.toLocaleString()}원
                                      <strong className="text-amber-400 ml-1">
                                        ({cd.diffAmount.toLocaleString()}원, {cd.diffPercent}%)
                                      </strong>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {prev.newMenusCount > 0 && (
                            <div className="mt-2 pt-2 border-t border-slate-800/80">
                              <p className="text-indigo-300 font-semibold mb-1">
                                ℹ️ 처음 보는 메뉴 ({prev.newMenusCount}개) - 마스터에 없어 [메뉴 관리]의 &quot;분류 필요&quot;에 자동 등록됩니다:
                              </p>
                              <p className="text-[11px] text-slate-400 truncate">
                                {prev.newMenus.slice(0, 8).join(', ')}
                                {prev.newMenus.length > 8 ? ` 외 ${prev.newMenus.length - 8}개` : ''}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* 저장 버튼 및 상태 */}
                        <div className="flex items-center justify-between pt-2">
                          <div>
                            {item.saveStatus === 'done' && (
                              <span className="text-emerald-400 font-bold">✓ {item.saveMessage}</span>
                            )}
                            {item.saveStatus === 'failed' && (
                              <span className="text-rose-400 font-bold">✕ {item.saveMessage}</span>
                            )}
                          </div>

                          {item.saveStatus !== 'done' && (
                            <button
                              type="button"
                              disabled={item.saveStatus === 'saving'}
                              onClick={() => runSaveItem(idx)}
                              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-md ${
                                mode === 'overwrite'
                                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                              } disabled:opacity-50`}
                            >
                              {item.saveStatus === 'saving'
                                ? '저장 처리 중...'
                                : mode === 'overwrite'
                                ? '덮어쓰기로 저장'
                                : '빈 날짜 채우기로 저장'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 저장 완료 후 안내 카드 */}
        <div className="rounded-2xl border border-purple-900/50 bg-purple-950/20 p-4 text-xs text-purple-200 leading-relaxed space-y-2">
          <p className="font-bold flex items-center gap-1.5 text-purple-100 text-sm">
            <span>📅</span> 과거 매장 사정도 함께 기록해 두세요
          </p>
          <p>
            과거 매출을 가져온 뒤, 작년 이 기간의 명절·지역 행사·훈련·공사·경쟁점 개업 같은 매장 사정을 함께 기록해 두시면,
            AI가 전년 동월 대비 분석 및 다음 달 예측 시 사정 영향을 정확하게 분리하여 진단합니다.
          </p>
          <Link
            href="/settings/events"
            className="inline-flex items-center gap-1 font-bold text-purple-300 hover:text-purple-100 underline text-xs"
          >
            매장 사정 기록 바로가기 →
          </Link>
        </div>

        {/* 가져온 묶음(배치) 내역 및 취소 */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">가져오기 내역 및 취소</h2>
            <button
              type="button"
              onClick={loadBatches}
              className="text-xs text-sky-400 hover:text-sky-300"
            >
              새로고침
            </button>
          </div>

          {loadingBatches ? (
            <p className="text-xs text-slate-500 py-4 text-center">내역을 불러오는 중...</p>
          ) : batches.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center border border-dashed border-slate-800 rounded-2xl">
              아직 가져온 과거 매출 내역이 없습니다.
            </p>
          ) : (
            <div className="space-y-3">
              {batches.map((b) => (
                <div
                  key={b.id}
                  className={`rounded-2xl border p-4 text-xs flex flex-wrap items-center justify-between gap-3 ${
                    b.undone_at
                      ? 'border-slate-800 bg-slate-950/40 text-slate-500 opacity-60'
                      : 'border-slate-800 bg-slate-950/80 text-slate-300'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-100 text-sm">{b.year_month}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-300">
                        {b.mode === 'overwrite' ? '덮어쓰기' : '빈날짜채우기'}
                      </span>
                      {b.undone_at && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          취소됨 ({new Date(b.undone_at).toLocaleDateString('ko-KR')})
                        </span>
                      )}
                    </div>
                    <p className="text-slate-400">
                      파일명: {b.file_name} · 등록: {b.days_written}일 (메뉴 {b.menu_rows}건) · 합계{' '}
                      {(b.total_amount / 10000).toFixed(0)}만원
                    </p>
                    <p className="text-[11px] text-slate-600">
                      가져온 일시: {new Date(b.created_at).toLocaleString('ko-KR')}
                    </p>
                  </div>

                  {!b.undone_at && (
                    <button
                      type="button"
                      disabled={undoingId === b.id}
                      onClick={() => handleUndoBatch(b)}
                      className="px-3 py-1.5 rounded-lg border border-rose-800 bg-rose-950/30 text-rose-300 hover:bg-rose-900/40 text-xs font-semibold transition disabled:opacity-50"
                    >
                      {undoingId === b.id ? '취소 처리 중...' : '가져오기 취소'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomTabNav />
    </div>
  );
}
