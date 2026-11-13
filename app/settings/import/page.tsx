'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import BottomTabNav from '@/components/BottomTabNav';
import {
  detectYearMonthFromFileName,
  getNextYearMonth,
} from '@/lib/parsers/okposDate';

interface ImportBatch {
  id: string;
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

interface PreviewData {
  yearMonth: string;
  fileName: string;
  fileSha256: string;
  isDuplicateFile: boolean;
  duplicateBatchInfo: any;
  isAlreadyImported: boolean;
  totalAmount: number;
  netRevenue: number;
  tax: number;
  menuCount: number;
  openDaysCount: number;
  zeroRevenueDays: string[];
  existingDaysCount: number;
  daysToInsert: number;
  daysToFillZero: number;
  zeroSalesDates: string[];
  daysToOverwrite: number;
  conflictingDays: Array<{
    date: string;
    appNetRevenue: number;
    fileNetRevenue: number;
    diffAmount: number;
    diffPercent: number;
  }>;
  newMenusCount: number;
  newMenus: string[];
}

interface QueueItem {
  id: string;
  file?: File;
  htmlText?: string;
  name: string;
  sizeText?: string;
  yearMonth: string;
  manualYm?: boolean; // 사용자가 직접 수정한 연·월인지
  isDuplicateYm?: boolean;
  preview?: PreviewData;
  error?: string;
  loading?: boolean;
  saveStatus?: 'idle' | 'saving' | 'done' | 'failed' | 'skipped';
  saveMessage?: string;
  savedStats?: {
    daysWritten: number;
    zeroDaysFilled: number;
    skippedDays: number;
    menuRowsWritten: number;
  };
}

export default function OkposImportPage() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [generalMessage, setGeneralMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // C-8: 0원 날 채우기 토글 (기본 꺼짐)
  const [fillZeroSales, setFillZeroSales] = useState(false);

  // A-2: 첫 달 선택 및 순차 배정
  const [firstMonth, setFirstMonth] = useState('2024-01');
  const [editingYmIndex, setEditingYmIndex] = useState<number | null>(null);

  // A-1: 일괄 저장 진행 상태
  const [isBatchSaving, setIsBatchSaving] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; currentYm?: string }>({
    current: 0,
    total: 0,
  });
  const [batchCompleted, setBatchCompleted] = useState(false);

  // 세부 파일 카드 펼침/접힘
  const [expandedDetails, setExpandedDetails] = useState(false);

  // 보조: HTML 텍스트 직접 붙여넣기
  const [pastedHtml, setPastedHtml] = useState('');
  const [pastedYm, setPastedYm] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [showPasteBox, setShowPasteBox] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 사용자 권한 확인 (소유자 전용 C-5)
  useEffect(() => {
    fetch('/api/me/role')
      .then((res) => res.json())
      .then((data) => {
        if (data.role) setUserRole(data.role);
      })
      .catch(() => {})
      .finally(() => setRoleLoading(false));
  }, []);

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

  // 파일 선택 처리 (4MB 사전 검사 C-5, 연·월 자동 배정 A-2)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const validFiles: File[] = [];
    const oversizedFiles: string[] = [];

    // 4MB 사전 검사
    for (const f of fileList) {
      if (f.size > 4 * 1024 * 1024) {
        oversizedFiles.push(f.name);
      } else {
        validFiles.push(f);
      }
    }

    if (oversizedFiles.length > 0) {
      setGeneralMessage({
        type: 'error',
        text: `4MB 이하 파일만 올릴 수 있어요. (${oversizedFiles.join(', ')} 제외됨)`,
      });
    }

    if (validFiles.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // 파일명에서 연·월 감지 시도
    let currentAssignedYm = firstMonth;
    const newItems: QueueItem[] = validFiles.map((f, i) => {
      const detectedYm = detectYearMonthFromFileName(f.name);
      const ym = detectedYm || (i === 0 ? currentAssignedYm : (currentAssignedYm = getNextYearMonth(currentAssignedYm)));
      if (detectedYm) {
        currentAssignedYm = detectedYm;
      }
      return {
        id: `${f.name}-${Date.now()}-${i}`,
        file: f,
        name: f.name,
        sizeText: `${(f.size / 1024).toFixed(1)} KB`,
        yearMonth: ym,
        manualYm: !!detectedYm,
        loading: false,
        saveStatus: 'idle',
      };
    });

    // 파일명에 연·월이 명시된 경우 연·월 기준 정렬
    const allHaveDetected = validFiles.every((f) => !!detectYearMonthFromFileName(f.name));
    if (allHaveDetected) {
      newItems.sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
    }

    setQueue((prev) => recheckDuplicateYm([...prev, ...newItems]));
    setBatchCompleted(false);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 연·월 중복 표시 검사
  const recheckDuplicateYm = (items: QueueItem[]): QueueItem[] => {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item.yearMonth, (counts.get(item.yearMonth) || 0) + 1);
    }
    return items.map((item) => ({
      ...item,
      isDuplicateYm: (counts.get(item.yearMonth) || 0) > 1,
    }));
  };

  // 첫 달 변경 시 연·월 없는 파일들 순차 재배정
  const handleFirstMonthChange = (newFirstYm: string) => {
    setFirstMonth(newFirstYm);
    setQueue((prev) => {
      let currentYm = newFirstYm;
      const updated = prev.map((item, i) => {
        if (!item.manualYm) {
          const ym = i === 0 ? currentYm : (currentYm = getNextYearMonth(currentYm));
          return { ...item, yearMonth: ym, preview: undefined, error: undefined };
        }
        return item;
      });
      return recheckDuplicateYm(updated);
    });
  };

  // 개별 파일 연·월 수동 변경
  const handleItemYmChange = (index: number, newYm: string) => {
    setQueue((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        yearMonth: newYm,
        manualYm: true,
        preview: undefined,
        error: undefined,
      };
      return recheckDuplicateYm(next);
    });
    setEditingYmIndex(null);
  };

  // 붙여넣기 텍스트 대기열 추가
  const handleAddPastedHtml = () => {
    if (!pastedHtml.trim()) return;
    const name = `붙여넣기 ${pastedYm}`;
    const bytes = new TextEncoder().encode(pastedHtml).length;
    const sizeText = `${(bytes / 1024).toFixed(1)} KB (텍스트)`;

    setQueue((prev) =>
      recheckDuplicateYm([
        ...prev,
        {
          id: `paste-${Date.now()}`,
          htmlText: pastedHtml,
          name,
          sizeText,
          yearMonth: pastedYm,
          manualYm: true,
          loading: false,
          saveStatus: 'idle',
        },
      ])
    );

    setPastedHtml('');
    setShowPasteBox(false);
    setBatchCompleted(false);
  };

  // 개별 항목 미리보기 API 호출
  const fetchItemPreview = async (item: QueueItem, index: number) => {
    setQueue((prev) => {
      const next = [...prev];
      if (next[index]) next[index] = { ...next[index], loading: true, error: undefined };
      return next;
    });

    try {
      const fd = new FormData();
      fd.append('action', 'preview');
      fd.append('year_month', item.yearMonth);
      fd.append('fill_zero_sales', fillZeroSales ? 'true' : 'false');
      if (item.file) {
        fd.append('file', item.file);
      } else if (item.htmlText) {
        fd.append('html_text', item.htmlText);
      }

      const res = await fetch('/api/import/okpos', { method: 'POST', body: fd });
      const data = await res.json().catch(() => null);

      setQueue((prev) => {
        const next = [...prev];
        if (!next[index]) return prev;
        if (!res.ok) {
          next[index] = {
            ...next[index],
            loading: false,
            error: data?.error || '미리보기 분석에 실패했습니다.',
            preview: undefined,
          };
        } else {
          next[index] = {
            ...next[index],
            loading: false,
            preview: data?.preview,
            error: undefined,
          };
        }
        return next;
      });
    } catch (e) {
      setQueue((prev) => {
        const next = [...prev];
        if (next[index]) {
          next[index] = {
            ...next[index],
            loading: false,
            error: '서버와 통신할 수 없습니다. 잠시 후 다시 시도해 주세요.',
            preview: undefined,
          };
        }
        return next;
      });
    }
  };

  // 대기열에 새로 들어오거나 연·월/옵션 변경 시 미리보기 자동 실행
  useEffect(() => {
    queue.forEach((item, idx) => {
      if (!item.preview && !item.loading && !item.error) {
        fetchItemPreview(item, idx);
      }
    });
  }, [queue, fillZeroSales]);

  // 옵션(0원 채우기) 변경 시 기존 미리보기 초기화
  const handleToggleFillZero = (checked: boolean) => {
    setFillZeroSales(checked);
    setQueue((prev) =>
      prev.map((item) => ({
        ...item,
        preview: undefined,
        error: undefined,
      }))
    );
  };

  // 전체 요약 계산 (A-1)
  const summary = useMemo(() => {
    if (queue.length === 0) return null;

    const sortedYms = [...queue].map((q) => q.yearMonth).sort();
    const firstYm = sortedYms[0];
    const lastYm = sortedYms[sortedYms.length - 1];

    let grandTotalAmount = 0;
    let grandNetRevenue = 0;
    let totalInsertDays = 0;
    let totalFillZeroDays = 0;
    let totalExistingDays = 0;
    let problemCount = 0;
    const problemMonths: Array<{ ym: string; name: string; reason: string }> = [];

    for (const item of queue) {
      if (item.error) {
        problemCount++;
        problemMonths.push({ ym: item.yearMonth, name: item.name, reason: item.error });
        continue;
      }
      if (item.isDuplicateYm) {
        problemCount++;
        problemMonths.push({
          ym: item.yearMonth,
          name: item.name,
          reason: '같은 연·월이 다른 파일과 중복 배정되었습니다.',
        });
        continue;
      }
      if (item.preview) {
        grandTotalAmount += item.preview.totalAmount;
        grandNetRevenue += item.preview.netRevenue;
        totalInsertDays += item.preview.daysToInsert;
        totalFillZeroDays += fillZeroSales ? item.preview.daysToFillZero : 0;
        totalExistingDays += item.preview.existingDaysCount;

        const availableDays = item.preview.daysToInsert + (fillZeroSales ? item.preview.daysToFillZero : 0);
        if (availableDays === 0) {
          problemCount++;
          problemMonths.push({
            ym: item.yearMonth,
            name: item.name,
            reason: item.preview.isAlreadyImported ? '이미 가져온 달입니다. (등록할 빈 날짜 없음)' : '등록할 빈 날짜가 없습니다.',
          });
        }
      }
    }

    const totalRegisterDays = totalInsertDays + totalFillZeroDays;

    return {
      firstYm,
      lastYm,
      fileCount: queue.length,
      grandTotalAmount,
      grandNetRevenue,
      totalRegisterDays,
      totalInsertDays,
      totalFillZeroDays,
      totalExistingDays,
      problemCount,
      problemMonths,
    };
  }, [queue, fillZeroSales]);

  // 단일 항목 저장
  const runSaveItem = async (idx: number): Promise<boolean> => {
    const item = queue[idx];
    if (!item || !item.preview) return false;

    setQueue((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], saveStatus: 'saving', saveMessage: undefined };
      return next;
    });

    try {
      const fd = new FormData();
      fd.append('action', 'save');
      fd.append('year_month', item.yearMonth);
      fd.append('mode', 'fill');
      fd.append('fill_zero_sales', fillZeroSales ? 'true' : 'false');
      if (item.file) {
        fd.append('file', item.file);
      } else if (item.htmlText) {
        fd.append('html_text', item.htmlText);
      }

      const res = await fetch('/api/import/okpos', { method: 'POST', body: fd });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setQueue((prev) => {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            saveStatus: 'failed',
            saveMessage: data?.error || '저장 중 오류가 발생했습니다.',
          };
          return next;
        });
        return false;
      }

      setQueue((prev) => {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          saveStatus: 'done',
          saveMessage: data?.message || '저장 완료',
          savedStats: {
            daysWritten: data?.daysWritten ?? 0,
            zeroDaysFilled: data?.zeroDaysFilled ?? 0,
            skippedDays: data?.skippedDays ?? 0,
            menuRowsWritten: data?.menuRowsWritten ?? 0,
          },
        };
        return next;
      });
      return true;
    } catch (e) {
      setQueue((prev) => {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          saveStatus: 'failed',
          saveMessage: '서버와 통신할 수 없습니다. 잠시 후 다시 시도해 주세요.',
        };
        return next;
      });
      return false;
    }
  };

  // 일괄 전체 저장 (A-1: 한 번에 1건씩 순서대로 실행)
  const handleBatchSave = async (onlyFailed = false) => {
    if (queue.length === 0 || isBatchSaving) return;

    setIsBatchSaving(true);
    setGeneralMessage(null);
    setBatchCompleted(false);

    const targetIndices = queue
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => {
        if (onlyFailed) return item.saveStatus === 'failed';
        return item.saveStatus !== 'done';
      })
      .map(({ idx }) => idx);

    let currentStep = 0;
    setBatchProgress({ current: 0, total: targetIndices.length });

    for (const idx of targetIndices) {
      const item = queue[idx];
      currentStep++;
      setBatchProgress({ current: currentStep, total: targetIndices.length, currentYm: item.yearMonth });

      // 유효하지 않거나 에러 상태이면 건너뛰기
      if (item.error || item.isDuplicateYm || !item.preview) {
        setQueue((prev) => {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            saveStatus: 'skipped',
            saveMessage: item.error || '연·월 중복 또는 오류로 건너뜁니다.',
          };
          return next;
        });
        continue;
      }

      const availableDays = item.preview.daysToInsert + (fillZeroSales ? item.preview.daysToFillZero : 0);
      if (availableDays === 0) {
        setQueue((prev) => {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            saveStatus: 'skipped',
            saveMessage: '등록할 빈 날짜가 없어 건너뜁니다.',
          };
          return next;
        });
        continue;
      }

      await runSaveItem(idx);
    }

    setIsBatchSaving(false);
    setBatchCompleted(true);
    await loadBatches();
  };

  // 가져오기 취소 (C-6 문구 반영)
  const handleUndoBatch = async (batch: ImportBatch) => {
    const confirmMsg = `${batch.year_month} 가져오기(${batch.file_name})를 취소하시겠습니까?\n\n이 묶음으로 등록된 매출이 삭제되거나 원래 상태로 복원됩니다.\n(가져온 뒤 일별 매출 화면에서 고친 내용도 함께 삭제됩니다.)`;
    if (!window.confirm(confirmMsg)) return;

    setUndoingId(batch.id);
    setGeneralMessage(null);

    try {
      const res = await fetch(`/api/import/okpos?id=${batch.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setGeneralMessage({ type: 'error', text: data?.error || '가져오기 취소에 실패했습니다.' });
      } else {
        setGeneralMessage({ type: 'success', text: data?.message || '가져오기가 취소되었습니다.' });
        await loadBatches();
        // 대기열에 해당 월이 있으면 미리보기 새로고침
        setQueue((prev) =>
          prev.map((item) =>
            item.yearMonth === batch.year_month
              ? { ...item, preview: undefined, error: undefined, saveStatus: 'idle', saveMessage: undefined }
              : item
          )
        );
      }
    } catch (e) {
      setGeneralMessage({ type: 'error', text: '취소 처리 중 오류가 발생했습니다.' });
    } finally {
      setUndoingId(null);
    }
  };

  // 권한 확인 중 화면
  if (roleLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <p className="text-sm text-slate-400">권한을 확인하고 있습니다...</p>
      </div>
    );
  }

  // 매장 소유자 권한이 아닌 경우 (소유자 전용 403 C-5)
  if (userRole !== 'owner') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4">
          <span className="text-4xl">🔒</span>
          <h1 className="text-lg font-bold text-slate-100">매장 소유자 전용 기능</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            과거 매출 가져오기는 매장 소유자(Owner) 계정으로만 접근하실 수 있습니다.
          </p>
          <Link
            href="/settings"
            className="inline-block px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition"
          >
            ← 설정으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  // 전체 완료 여부 및 통계 (A-4)
  const completedStats = (() => {
    if (!batchCompleted) return null;
    const doneItems = queue.filter((q) => q.saveStatus === 'done');
    const failedItems = queue.filter((q) => q.saveStatus === 'failed');
    const skippedItems = queue.filter((q) => q.saveStatus === 'skipped');

    let totalWritten = 0;
    let newDays = 0;
    let zeroDays = 0;
    let skippedDays = 0;

    doneItems.forEach((item) => {
      if (item.savedStats) {
        newDays += item.savedStats.daysWritten;
        zeroDays += item.savedStats.zeroDaysFilled;
        skippedDays += item.savedStats.skippedDays;
        totalWritten += item.savedStats.daysWritten + item.savedStats.zeroDaysFilled;
      }
    });

    return {
      doneCount: doneItems.length,
      failedCount: failedItems.length,
      skippedCount: skippedItems.length,
      totalWritten,
      newDays,
      zeroDays,
      skippedDays,
      failedItems,
    };
  })();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-28">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* 휴대폰 상단 안내 (A-5) */}
        <div className="rounded-2xl border border-sky-800/40 bg-sky-950/30 p-3 text-xs text-sky-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span>💡</span>
            <span>PC에서 진행하시면 여러 달 파일을 한 번에 올리기 편합니다.</span>
          </div>
          <span className="text-[11px] text-sky-400 font-semibold whitespace-nowrap">스캔 횟수에 포함되지 않습니다</span>
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <Link href="/settings" className="text-xs text-slate-400 hover:text-slate-200">
              ← 설정
            </Link>
            <h1 className="text-2xl font-extrabold text-white mt-1">과거 매출 가져오기 (OKPOS)</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              OKPOS 관리자 웹에서 받은 엑셀 파일로 몇 년치 매출과 메뉴 판매 이력을 한 번에 등록합니다.
            </p>
          </div>
        </div>

        {/* OKPOS 받는 법 3단계 안내 카드 (A-3) */}
        <div className="rounded-3xl border border-indigo-900/50 bg-gradient-to-br from-indigo-950/40 to-slate-900/90 p-5 space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-indigo-100 flex items-center gap-2">
              <span>📋</span> OKPOS 웹에서 엑셀 파일 받는 법 (3단계)
            </h2>
            <span className="text-[11px] text-indigo-300 font-medium bg-indigo-900/50 px-2.5 py-0.5 rounded-full">
              모든 플랜 무료
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
            <div className="bg-slate-950/60 p-3 rounded-2xl border border-indigo-900/30 space-y-1">
              <span className="font-bold text-sky-400 block text-xs">① 메뉴 이동</span>
              <p className="text-slate-300 leading-normal">
                OKPOS 관리자 웹 로그인 후<br />
                <strong>[매출 관리] → [메뉴별 매출(일자별)]</strong> 로 이동
              </p>
            </div>
            <div className="bg-slate-950/60 p-3 rounded-2xl border border-indigo-900/30 space-y-1">
              <span className="font-bold text-sky-400 block text-xs">② 기간 선택</span>
              <p className="text-slate-300 leading-normal">
                조회 기간을 <strong>한 달 단위 (1일 ~ 말일)</strong>로 지정하여 조회
              </p>
            </div>
            <div className="bg-slate-950/60 p-3 rounded-2xl border border-indigo-900/30 space-y-1">
              <span className="font-bold text-sky-400 block text-xs">③ 엑셀 저장</span>
              <p className="text-slate-300 leading-normal">
                우측 상단 <strong>[엑셀 다운로드]</strong> 클릭.<br />
                과거 필요한 달마다 반복 저장
              </p>
            </div>
          </div>

          {/* 접힌 붙여넣기 안내 (A-3) */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowPasteBox((v) => !v)}
              className="text-xs text-indigo-300 hover:text-indigo-100 flex items-center gap-1.5 transition"
            >
              <span>{showPasteBox ? '▼' : '▶'}</span>
              <span>파일 다운로드가 안 될 때: 웹 표 소스 직접 붙여넣기 (보조)</span>
            </button>

            {showPasteBox && (
              <div className="mt-3 space-y-3 bg-slate-950/90 p-4 rounded-2xl border border-slate-800">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-400">해당 연·월:</label>
                  <input
                    type="month"
                    value={pastedYm}
                    onChange={(e) => setPastedYm(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100"
                  />
                </div>
                <textarea
                  rows={5}
                  value={pastedHtml}
                  onChange={(e) => setPastedHtml(e.target.value)}
                  placeholder="OKPOS 보고서 화면의 표 소스(HTML)를 여기에 붙여넣으세요..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 font-mono placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!pastedHtml.trim()}
                    onClick={handleAddPastedHtml}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition disabled:opacity-40"
                  >
                    대기열에 추가
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {generalMessage && (
          <div
            className={`rounded-2xl border p-4 text-xs font-semibold ${
              generalMessage.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
            }`}
          >
            {generalMessage.text}
          </div>
        )}

        {/* 1. 파일 선택 영역 */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-white">1. 다운로드한 OKPOS 파일 올리기</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                한 개 또는 수십 개 달의 파일을 한꺼번에 선택하셔도 연·월이 자동 배정됩니다.
              </p>
            </div>
            {queue.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setQueue([]);
                  setBatchCompleted(false);
                }}
                className="text-xs text-rose-400 hover:text-rose-300"
              >
                대기열 비우기
              </button>
            )}
          </div>

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
            <span className="text-xs text-slate-400 mt-1">
              Ctrl이나 Shift를 눌러 여러 달 파일을 한꺼번에 선택하실 수 있습니다. (4MB 이하)
            </span>
          </label>

          {/* C-8: 0원 날 채우기 옵션 체크박스 */}
          <div className="pt-2 border-t border-slate-800">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={fillZeroSales}
                onChange={(e) => handleToggleFillZero(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-slate-900 text-sky-600 focus:ring-sky-500"
              />
              <div className="text-xs">
                <span className="font-bold text-slate-200 block">앱에 0원으로 저장된 날도 채우기</span>
                <span className="text-slate-400">
                  기존에 영수증이나 메모를 남겨두고 매출이 0원으로 등록된 날이 있다면,
                  영수증과 메모는 그대로 유지하고 OKPOS 매출과 메뉴 판매 이력을 채웁니다.
                </span>
              </div>
            </label>
          </div>

          {/* A-2: 파일명에 연·월이 없을 때 첫 달 지정 */}
          {queue.length > 0 && queue.some((q) => !q.manualYm) && (
            <div className="p-3 bg-slate-950/70 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-bold text-slate-200 block">첫 달(시작 연·월) 지정</span>
                <span className="text-slate-400">
                  파일명에 연·월이 없는 파일들은 선택한 순서대로 첫 달부터 1달씩 자동 배정됩니다.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="month"
                  value={firstMonth}
                  onChange={(e) => handleFirstMonthChange(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-bold"
                />
              </div>
            </div>
          )}
        </div>

        {/* 2. 전체 미리보기 및 요약 (A-1) */}
        {summary && (
          <div className="rounded-3xl border border-sky-900/60 bg-gradient-to-b from-sky-950/30 to-slate-900/90 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">전체 요약</span>
                <h2 className="text-lg font-extrabold text-white">
                  {summary.firstYm} ~ {summary.lastYm} ({summary.fileCount}개월)
                </h2>
              </div>
              <span className="text-xs bg-sky-900/50 text-sky-200 px-3 py-1 rounded-full font-semibold">
                등록 예정 {summary.totalRegisterDays}일
              </span>
            </div>

            {/* 수치 그리드 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800">
              <div>
                <span className="text-[11px] text-slate-400 block">총 매출 (합계)</span>
                <span className="text-sm font-extrabold text-white">
                  {summary.grandTotalAmount.toLocaleString()}원
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">순매출 (일별 합)</span>
                <span className="text-sm font-extrabold text-sky-400">
                  {summary.grandNetRevenue.toLocaleString()}원
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">신규 등록 예정</span>
                <span className="text-sm font-extrabold text-emerald-400">
                  {summary.totalInsertDays}일
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">0원 날 채움 예정</span>
                <span className="text-sm font-extrabold text-indigo-400">
                  {summary.totalFillZeroDays}일
                </span>
              </div>
            </div>

            {/* 문제 있는 달 목록 (A-1) */}
            {summary.problemMonths.length > 0 && (
              <div className="rounded-2xl border border-amber-900/60 bg-amber-950/20 p-3.5 space-y-2 text-xs">
                <p className="font-bold text-amber-300 flex items-center gap-1.5">
                  <span>⚠️</span> 확인이 필요한 달 ({summary.problemMonths.length}개):
                </p>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {summary.problemMonths.map((p, pIdx) => (
                    <div
                      key={pIdx}
                      className="flex flex-wrap items-center justify-between gap-1 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-amber-900/40"
                    >
                      <span className="font-bold text-slate-200">{p.ym} ({p.name})</span>
                      <span className="text-amber-300/90">{p.reason}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400">
                  * 문제가 있는 달은 자동으로 건너뛰고 정상적인 달만 저장됩니다.
                </p>
              </div>
            )}

            {/* 일괄 저장 진행 바 (A-1) */}
            {isBatchSaving && (
              <div className="space-y-2 bg-slate-950 p-4 rounded-2xl border border-sky-800">
                <div className="flex justify-between text-xs font-bold text-sky-300">
                  <span>
                    저장 진행 중: {batchProgress.current} / {batchProgress.total}개월
                    {batchProgress.currentYm ? ` (${batchProgress.currentYm} 처리 중)` : ''}
                  </span>
                  <span>{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-sky-500 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* 일괄 저장 버튼 (A-1) */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => setExpandedDetails((v) => !v)}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
              >
                <span>{expandedDetails ? '▼ 달별 상세 접기' : '▶ 달별 상세 펼쳐보기'}</span>
              </button>

              <button
                type="button"
                disabled={isBatchSaving || summary.totalRegisterDays === 0}
                onClick={() => handleBatchSave(false)}
                className="px-6 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-2xl text-sm font-extrabold shadow-lg transition disabled:opacity-40"
              >
                {isBatchSaving
                  ? `${batchProgress.current} / ${batchProgress.total}개월 저장 중...`
                  : summary.totalRegisterDays === 0
                  ? '등록할 빈 날짜가 없습니다'
                  : `한 번에 ${summary.fileCount}개월 전체 저장하기`}
              </button>
            </div>
          </div>
        )}

        {/* 3. 완료 화면 (A-4) */}
        {completedStats && (
          <div className="rounded-3xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/30 to-slate-900/90 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🎉</span>
              <div>
                <h2 className="text-lg font-extrabold text-white">과거 매출 등록 완료!</h2>
                <p className="text-xs text-emerald-300">
                  {summary?.firstYm} ~ {summary?.lastYm}, {completedStats.doneCount}개월 등록 완료
                  (신규 {completedStats.newDays}일, 0원 채움 {completedStats.zeroDays}일, 건너뜀 {completedStats.skippedDays}일)
                </p>
              </div>
            </div>

            {completedStats.failedCount > 0 && (
              <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-rose-900/50 space-y-2 text-xs">
                <p className="font-bold text-rose-300">
                  ✕ 저장을 완료하지 못한 달 ({completedStats.failedCount}개):
                </p>
                <div className="space-y-1">
                  {completedStats.failedItems.map((fItem, fIdx) => (
                    <div key={fIdx} className="flex justify-between text-slate-300">
                      <span>{fItem.yearMonth} ({fItem.name})</span>
                      <span className="text-rose-400">{fItem.saveMessage}</span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={isBatchSaving}
                  onClick={() => handleBatchSave(true)}
                  className="mt-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition"
                >
                  실패한 달만 다시 시도
                </button>
              </div>
            )}

            {/* 완료 후 추천 바로가기 버튼 2개 (A-4) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <Link
                href="/analytics/report"
                className="flex items-center justify-between p-4 bg-sky-950/50 border border-sky-800/60 rounded-2xl hover:border-sky-600 transition"
              >
                <div>
                  <span className="text-sm font-bold text-sky-200 block">📊 전년 비교 보러 가기</span>
                  <span className="text-[11px] text-sky-400/80">월간 보고서에서 작년 동월 대비 성장 분석 확인</span>
                </div>
                <span className="text-sky-400 font-bold text-lg">→</span>
              </Link>
              <Link
                href="/settings/events"
                className="flex items-center justify-between p-4 bg-purple-950/50 border border-purple-800/60 rounded-2xl hover:border-purple-600 transition"
              >
                <div>
                  <span className="text-sm font-bold text-purple-200 block">📅 작년 매장 사정 기록하기</span>
                  <span className="text-[11px] text-purple-400/80">명절·공사·행사 등 과거 사정을 넣어 AI 분석 정밀화</span>
                </div>
                <span className="text-purple-400 font-bold text-lg">→</span>
              </Link>
            </div>
          </div>
        )}

        {/* 4. 개별 파일 상세 대기열 (접힘/펼침 A-1) */}
        {queue.length > 0 && expandedDetails && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-300">달별 세부 목록 ({queue.length}건)</h3>
            <div className="space-y-3">
              {queue.map((item, idx) => {
                const prev = item.preview;
                const hasError = !!item.error || item.isDuplicateYm;
                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border p-4 space-y-3 transition ${
                      hasError
                        ? 'border-rose-800 bg-rose-950/20'
                        : item.saveStatus === 'done'
                        ? 'border-emerald-800/50 bg-slate-900/80'
                        : 'border-slate-800 bg-slate-900/80'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-100 text-sm truncate">{item.name}</p>
                        <p className="text-xs text-slate-500">{item.sizeText}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        {editingYmIndex === idx ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="month"
                              defaultValue={item.yearMonth}
                              onBlur={(e) => handleItemYmChange(idx, e.target.value)}
                              className="bg-slate-950 border border-sky-500 rounded-lg px-2 py-1 text-xs text-slate-100"
                              autoFocus
                            />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingYmIndex(idx)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                              item.isDuplicateYm
                                ? 'bg-rose-950 border-rose-700 text-rose-300'
                                : 'bg-slate-950 border-slate-700 text-sky-400 hover:border-sky-500'
                            }`}
                          >
                            {item.yearMonth} (수정)
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setQueue((prev) => recheckDuplicateYm(prev.filter((_, i) => i !== idx)))}
                          className="text-xs text-slate-500 hover:text-rose-400 px-1.5"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {item.loading && (
                      <p className="text-xs text-slate-400">데이터를 분석하고 있습니다...</p>
                    )}

                    {item.error && (
                      <p className="text-xs text-rose-400 font-semibold">{item.error}</p>
                    )}

                    {item.isDuplicateYm && (
                      <p className="text-xs text-rose-400 font-semibold">
                        ⚠️ 같은 연·월({item.yearMonth})이 배정된 파일이 대기열에 더 있습니다.
                      </p>
                    )}

                    {prev && (
                      <div className="space-y-2 text-xs">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950/60 p-2.5 rounded-xl text-[11px]">
                          <div>
                            <span className="text-slate-500 block">합계</span>
                            <span className="font-bold text-white">{prev.totalAmount.toLocaleString()}원</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">순매출</span>
                            <span className="font-bold text-sky-400">{prev.netRevenue.toLocaleString()}원</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">영업 / 메뉴</span>
                            <span className="font-bold text-slate-300">{prev.openDaysCount}일 / {prev.menuCount}개</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">등록 예정</span>
                            <span className="font-bold text-emerald-400">
                              {prev.daysToInsert + (fillZeroSales ? prev.daysToFillZero : 0)}일
                            </span>
                          </div>
                        </div>

                        {/* 차이나는 날짜 목록 */}
                        {prev.conflictingDays.length > 0 && (
                          <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800 space-y-1">
                            <span className="text-amber-400 font-bold block text-[11px]">
                              기존 매출과 차이나는 날짜 ({prev.conflictingDays.length}일):
                            </span>
                            <div className="max-h-20 overflow-y-auto space-y-0.5 text-[11px] text-slate-400">
                              {prev.conflictingDays.map((cd) => (
                                <div key={cd.date} className="flex justify-between">
                                  <span>{cd.date}</span>
                                  <span>
                                    앱 {cd.appNetRevenue.toLocaleString()}원 vs 파일 {cd.fileNetRevenue.toLocaleString()}원
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[11px] font-bold">
                            {item.saveStatus === 'done' && (
                              <span className="text-emerald-400">✓ {item.saveMessage}</span>
                            )}
                            {item.saveStatus === 'failed' && (
                              <span className="text-rose-400">✕ {item.saveMessage}</span>
                            )}
                            {item.saveStatus === 'skipped' && (
                              <span className="text-slate-400">건너뜀: {item.saveMessage}</span>
                            )}
                          </span>

                          {item.saveStatus !== 'done' && (
                            <button
                              type="button"
                              disabled={item.saveStatus === 'saving'}
                              onClick={() => runSaveItem(idx)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition disabled:opacity-50"
                            >
                              이 달만 저장
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

        {/* 5. 최근 가져온 묶음 내역 및 취소 */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white">과거 매출 가져온 내역</h2>
            <button
              type="button"
              onClick={loadBatches}
              className="text-xs text-sky-400 hover:text-sky-300"
            >
              새로고침
            </button>
          </div>

          {loadingBatches ? (
            <p className="text-xs text-slate-400">목록을 불러오고 있습니다...</p>
          ) : batches.length === 0 ? (
            <p className="text-xs text-slate-500">아직 가져온 과거 매출 내역이 없습니다.</p>
          ) : (
            <div className="divide-y divide-slate-800">
              {batches.map((b) => (
                <div key={b.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-100 text-sm">{b.year_month}</span>
                      {b.undone_at ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                          취소됨
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                          반영 중
                        </span>
                      )}
                    </div>
                    <p className="text-slate-400 mt-0.5">
                      {b.file_name} · 등록: {b.days_written}일 (메뉴 {b.menu_rows}건) · 합계 {b.total_amount.toLocaleString()}원
                    </p>
                    <p className="text-slate-500 text-[11px] mt-0.5">
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
