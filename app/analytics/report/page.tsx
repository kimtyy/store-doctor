'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import TermTooltip from '@/components/ui/TermTooltip';
import {
  calcComparisonMetricDelta,
  ComparisonMetricKind,
} from '@/lib/analytics/periodComparison';

const WEATHER_EMOJI: Record<string, string> = {
  '맑음': '☀️',
  '흐림': '☁️',
  '비': '🌧',
  '눈': '❄️'
};

function fmt(n: number): string {
  return n.toLocaleString();
}

function fmtMan(n: number): string {
  return (n / 10000).toFixed(1) + '만';
}

function ComparisonCell({
  current,
  base,
  kind = 'amount',
  hasBaseData = true,
  formatter = fmt,
  suffix = '원',
  invertColor = false,
}: {
  current: number;
  base: number;
  kind?: ComparisonMetricKind;
  hasBaseData?: boolean;
  formatter?: (v: number) => string;
  suffix?: string;
  invertColor?: boolean;
}) {
  const delta = calcComparisonMetricDelta(current, base, kind, hasBaseData);
  const deltaValue = kind === 'ratio' ? delta.diff : (delta.pct ?? 0);
  let colorClass = 'bg-slate-100 text-slate-500';
  if (deltaValue > 0.05) {
    colorClass = invertColor ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700';
  } else if (deltaValue < -0.05) {
    colorClass = invertColor ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700';
  }
  return (
    <div className="flex flex-col items-center sm:items-end justify-center">
      <span className="font-semibold text-slate-700 text-sm">{formatter(base)}{suffix}</span>
      {delta.formatted !== '-' ? (
        <span className={`text-[10px] font-bold px-1 py-0.5 mt-0.5 rounded ${colorClass}`}>
          {delta.formatted}
        </span>
      ) : (
        <span className="text-[10px] text-slate-400 mt-0.5">-</span>
      )}
    </div>
  );
}

function MonthlyReportContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const year = searchParams.get('year');
  const month = searchParams.get('month');

  const [role, setRole] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const includeEvent = searchParams.get('includeEvent') === 'true';

  useEffect(() => {
    fetch('/api/me/role')
      .then(r => r.json())
      .then(d => {
        if (d.role === 'staff') {
          router.replace('/dashboard');
        } else {
          setRole(d.role ?? null);
        }
      })
      .catch(() => {
        router.replace('/dashboard');
      });
  }, [router]);

  useEffect(() => {
    if (!role) return;
    if (!year || !month) return;
    
    setLoading(true);
    setError(null);
    fetch(`/api/analytics/report?year=${year}&month=${month}&includeEvent=${includeEvent}`)
      .then(async (r) => {
        const text = await r.text();
        let d: any = null;
        try {
          d = JSON.parse(text);
        } catch {
          throw new Error('보고서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
        if (!r.ok || !d || d.error) {
          throw new Error('보고서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
        setData(d);
      })
      .catch(() => setError('보고서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'))
      .finally(() => setLoading(false));
  }, [year, month, includeEvent, role]);

  if (!role) return <div className="p-8 text-center text-slate-400 animate-pulse">보고서 준비 중...</div>;
  if (!year || !month) return <div className="p-8 text-center text-slate-100">잘못된 접근입니다.</div>;
  if (loading) return <div className="p-8 text-center text-slate-400 animate-pulse">보고서 생성 중...</div>;
  if (error) return <div className="p-8 text-center text-rose-400">{error}</div>;
  if (!data) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleExcel = () => {
    // Generate simple CSV
    let csv = '\uFEFF'; // BOM
    csv += `매장명,${data.storeName}\n`;
    csv += `보고 기간,${data.year}년 ${data.month}월\n`;
    csv += `생성일시,${new Date(data.generatedAt).toLocaleString('ko-KR')}\n\n`;
    
    csv += `[매출 요약]\n`;
    csv += `총매출,${data.sales.totalRevenue}\n`;
    csv += `부가세 포함 매출,${data.sales.totalRevenueVatIncluded ?? 0}\n`;
    csv += `영업일수,${data.sales.openDays}\n`;
    csv += `평균일매출,${data.sales.avgDailySales}\n`;
    csv += `현금결제,${data.sales.cashAmount}\n`;
    csv += `카드결제,${data.sales.cardAmount}\n\n`;

    csv += `[비용 요약]\n`;
    csv += `총비용,${data.purchases.totalExpense ?? data.purchases.totalPurchase}\n`;
    csv += `총비용률,${(data.purchases.totalCostRatio ?? data.profit.totalCostRatio).toFixed(1)}%\n`;
    csv += `재료비(원가),${data.purchases.ingredientCost ?? data.purchases.totalPurchase}\n`;
    csv += `원가율(재료비 기준),${data.purchases.costRatio.toFixed(1)}%\n`;
    csv += `인건비율,${(data.purchases.laborRatio ?? 0).toFixed(1)}%\n`;
    csv += `FL 비율,${(data.purchases.flRatio ?? 0).toFixed(1)}%\n`;
    csv += `임대료율,${(data.purchases.rentRatio ?? 0).toFixed(1)}%\n`;
    (data.purchases.groups ?? []).forEach((g: any) => {
      csv += `${g.label},${g.amount},${g.ratioPct.toFixed(1)}%\n`;
    });
    csv += `\n`;

    csv += `[손익 계산서]\n`;
    csv += `남은 돈(영업이익),${data.profit.operatingProfit}\n`;
    csv += `대출금 상환,${data.profit.loanRepayment}\n`;
    csv += `사장님 인건비,${data.profit.ownerSalary}\n`;
    csv += `실질 순이익,${data.profit.netProfit}\n\n`;

    if (data.comparison) {
      const c = data.comparison.current;
      const p = data.comparison.prev;
      const l = data.comparison.lastYear;
      const hasPrev = p?.dataStatus ? p.dataStatus !== 'none' : Boolean(p?.hasData);
      const hasLast = l?.dataStatus ? l.dataStatus !== 'none' : Boolean(l?.hasData);
      const csvRow = (
        label: string,
        currVal: number,
        prevVal: number,
        lastVal: number,
        kind: ComparisonMetricKind,
        isRatio = false,
        suffix = ''
      ) => {
        const pDiff = calcComparisonMetricDelta(currVal, prevVal, kind, hasPrev).formatted;
        const lDiff = calcComparisonMetricDelta(currVal, lastVal, kind, hasLast).formatted;
        const f = (v: number) => (isRatio ? `${v.toFixed(1)}%` : `${v}${suffix}`);
        return `${label},${f(currVal)},${hasPrev ? f(prevVal) : '데이터 없음'},${pDiff},${hasLast ? f(lastVal) : '데이터 없음'},${lDiff}\n`;
      };

      csv += `[기간 비교 분석]\n`;
      csv += `항목,이번달,전월,전월 대비,전년동월,전년동월 대비\n`;
      csv += csvRow('총매출', c.totalRevenue, p.totalRevenue, l.totalRevenue, 'amount');
      csv += csvRow('총비용', c.totalExpense ?? c.totalPurchase, p.totalExpense ?? p.totalPurchase, l.totalExpense ?? l.totalPurchase, 'amount');
      (c.expenseGroups ?? []).forEach((g: any) => {
        const pAmt = p.groupTotals?.[g.key] ?? 0;
        const lAmt = l.groupTotals?.[g.key] ?? 0;
        if (g.amount > 0 || pAmt > 0 || lAmt > 0) {
          csv += csvRow(`  ${g.label}`, g.amount, pAmt, lAmt, 'amount');
        }
      });
      csv += csvRow('남은 돈(영업이익)', c.operatingProfit, p.operatingProfit, l.operatingProfit, 'amount');
      csv += csvRow('원가율(재료비)', c.costRatio, p.costRatio, l.costRatio, 'ratio', true);
      csv += csvRow('인건비율', c.laborRatio ?? 0, p.laborRatio ?? 0, l.laborRatio ?? 0, 'ratio', true);
      csv += csvRow('FL 비율', c.flRatio ?? 0, p.flRatio ?? 0, l.flRatio ?? 0, 'ratio', true);
      csv += csvRow('임대료율', c.rentRatio ?? 0, p.rentRatio ?? 0, l.rentRatio ?? 0, 'ratio', true);
      csv += csvRow('총비용률', c.totalCostRatio ?? 0, p.totalCostRatio ?? 0, l.totalCostRatio ?? 0, 'ratio', true);
      csv += csvRow('영업이익률', c.operatingProfitRatio ?? 0, p.operatingProfitRatio ?? 0, l.operatingProfitRatio ?? 0, 'ratio', true);
      csv += csvRow('일평균매출', c.avgDailySales, p.avgDailySales, l.avgDailySales, 'amount');
      csv += csvRow('객단가', c.avgSpend, p.avgSpend, l.avgSpend, 'amount');
      csv += csvRow('영업일수', c.openDays, p.openDays, l.openDays, 'amount', false, '일');
      csv += `\n`;
    }

    if (data.prediction) {
      csv += `[다음달 예측 (${data.prediction.nextMonth}월)]\n`;
      if (!data.prediction.hasEnoughData) {
        csv += `안내,데이터가 쌓일수록 예측 정확도가 높아집니다 (현재 6개월 미만)\n`;
      }
      csv += `매출 예측 범위,${data.prediction.predictedMin} ~ ${data.prediction.predictedMax}원\n`;
      csv += `예측 근거,"${data.prediction.predictionBasis}"\n`;
      csv += `계절성/날씨 영향,"${data.prediction.seasonality}"\n`;
      csv += `공휴일/주말,"${data.prediction.holidays.join(', ')} / 주말 ${data.prediction.weekendCount}일"\n`;
      csv += `주류 발주 권장,${data.prediction.recommendedAlcohol}원 수준\n`;
      csv += `식자재 발주 권장,${data.prediction.recommendedFood}원 수준\n`;
      csv += `AI 종합 예측,"${data.prediction.aiDiagnosis}"\n\n`;
    }

    csv += `[손익분기점 분석]\n`;
    csv += `고정비 합계,${data.bep.fixedCostsSum}\n`;
    csv += `평균 변동비율,${(data.bep.variableCostRatio * 100).toFixed(1)}%\n`;
    csv += `손익분기점,${data.bep.bep}\n`;
    csv += `현재 월매출,${data.bep.currentRevenue}\n`;
    csv += `${data.bep.bepShortfall > 0 ? '부족액' : '초과액'},${data.bep.bepShortfall > 0 ? '-' : '+'}${Math.abs(data.bep.bepShortfall)}\n`;
    csv += `AI 진단,"${data.bep.aiDiagnosis}"\n\n`;

    if (data.weather?.stats?.length > 0) {
      csv += `[날씨별 매출 상관관계]\n`;
      data.weather.stats.forEach((w: any) => {
        csv += `${w.condition} (${w.days}일),평균 ${w.avgRevenue}원\n`;
      });
      if (data.weather.aiDiagnosis) {
        csv += `AI 진단,"${data.weather.aiDiagnosis}"\n`;
      }
      csv += `\n`;
    }

    csv += `[AI 월간 진단]\n`;
    csv += `"${data.aiDiagnosis}"\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${data.storeName}_${data.year}년_${data.month}월_영업보고서.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totalExpense = data.purchases.totalExpense ?? data.purchases.totalPurchase ?? 0;
  const ingredientCost = data.purchases.ingredientCost ?? 0;
  const totalCostRatio = data.purchases.totalCostRatio ?? data.profit.totalCostRatio ?? 0;
  const operatingProfitRatio =
    data.profit.operatingProfitRatio ??
    (data.sales.totalRevenue > 0 ? (data.profit.operatingProfit / data.sales.totalRevenue) * 100 : 0);

  const prevStatus = data.comparison?.prev?.dataStatus;
  const hasPrevData = Boolean(
    prevStatus
      ? prevStatus !== 'none'
      : data.comparison?.prev?.hasData ??
          (data.comparison?.prev &&
            (data.comparison.prev.openDays > 0 ||
              data.comparison.prev.totalRevenue > 0 ||
              (data.comparison.prev.totalExpense ?? data.comparison.prev.totalPurchase) > 0))
  );
  const lastYearStatus = data.comparison?.lastYear?.dataStatus;
  const hasLastYearData = Boolean(
    lastYearStatus
      ? lastYearStatus !== 'none'
      : data.comparison?.lastYear?.hasData ??
          (data.comparison?.lastYear &&
            (data.comparison.lastYear.openDays > 0 ||
              data.comparison.lastYear.totalRevenue > 0 ||
              (data.comparison.lastYear.totalExpense ?? data.comparison.lastYear.totalPurchase) > 0))
  );

  const cashPct =
    data.sales.totalRevenueVatIncluded > 0
      ? Math.round((data.sales.cashAmount / data.sales.totalRevenueVatIncluded) * 100)
      : 0;
  const cardPct =
    data.sales.totalRevenueVatIncluded > 0
      ? Math.round((data.sales.cardAmount / data.sales.totalRevenueVatIncluded) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 print:bg-white pb-20">
      {/* Top Actions (Hidden in print) */}
      <div className="sticky top-0 bg-white/90 backdrop-blur shadow-sm p-4 flex gap-2 print:hidden z-50">
        <button onClick={() => router.back()} className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-300 transition">
          ← 뒤로
        </button>
        <div className="flex-1" />
        <button onClick={handleExcel} className="rounded-xl bg-emerald-100 text-emerald-800 px-4 py-2 text-sm font-semibold hover:bg-emerald-200 transition">
          엑셀 다운로드
        </button>
        <button onClick={handlePrint} className="rounded-xl bg-sky-600 text-white px-4 py-2 text-sm font-semibold hover:bg-sky-500 transition">
          PDF 저장
        </button>
      </div>

      <main className="max-w-2xl mx-auto p-6 space-y-8 bg-white shadow-sm mt-4 print:shadow-none print:mt-0 print:p-0">
        
        {/* Header */}
        <header className="text-center space-y-2 border-b-2 border-slate-800 pb-6">
          <h1 className="text-3xl font-extrabold tracking-tight">{data.storeName} 월별 영업보고서</h1>
          <p className="text-lg font-medium text-slate-600">{data.year}년 {data.month}월</p>
          {data.dataCoverage && (
            <p className="text-xs font-medium text-slate-500">
              매출 입력 {data.dataCoverage.openDays}/{data.dataCoverage.expectedDays}일 · 매입 {data.dataCoverage.purchaseCount}건
            </p>
          )}
        </header>

        {data.dataCoverage?.isLowInputRate && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800 leading-relaxed">
            ⚠️ 이번 달 매출 입력률은 {Math.round((data.dataCoverage.inputRate ?? 0) * 100)}%입니다. 입력되지 않은 날이 있어 실제와 다를 수 있습니다.
          </div>
        )}

        {/* Top 3 Core Summary Cards: 매출 / 총비용 / 남은 돈 */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500 flex items-center">
              매출 <TermTooltip term="총매출" />
            </p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{fmt(data.sales.totalRevenue)}원</p>
            <p className="mt-1 text-xs text-slate-500">
              {hasPrevData ? (
                <>
                  전월 대비{' '}
                  <span className={data.sales.momChangePct >= 0 ? 'font-semibold text-sky-600' : 'font-semibold text-rose-600'}>
                    {data.sales.momChangePct > 0 ? '+' : ''}
                    {data.sales.momChangePct.toFixed(1)}%
                  </span>
                </>
              ) : (
                '전월 데이터 없음'
              )}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500 flex items-center">
              총비용 <TermTooltip term="총비용" />
            </p>
            <p className="mt-1 text-2xl font-extrabold text-rose-600">{fmt(totalExpense)}원</p>
            <p className="mt-1 text-xs text-slate-500">
              총비용률 {totalCostRatio.toFixed(1)}% · 원가율 {data.purchases.costRatio.toFixed(1)}%
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-white">
            <p className="text-xs font-semibold text-slate-300 flex items-center">
              남은 돈 (영업이익) <TermTooltip term="남은 돈" />
            </p>
            <p className={`mt-1 text-2xl font-extrabold ${data.profit.operatingProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {data.profit.operatingProfit >= 0 ? '+' : ''}
              {fmt(data.profit.operatingProfit)}원
            </p>
            <p className="mt-1 text-xs text-slate-400">
              영업이익률 {operatingProfitRatio.toFixed(1)}%
            </p>
          </div>
        </section>

        {/* AI Diagnosis */}
        <section className="bg-sky-50 border border-sky-200 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-sky-800 mb-2 flex items-center gap-1">
            <span>✨</span> AI 월간 진단
          </h2>
          <div className="text-slate-800 font-medium leading-relaxed text-sm">
            <p className="whitespace-pre-line">{data.aiDiagnosis}</p>
          </div>
        </section>

        {/* Sales Summary */}
        <section>
          <h2 className="text-xl font-bold mb-4 border-l-4 border-slate-800 pl-3">매출 요약</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-sm text-slate-500 mb-1 flex items-center">
                총매출 <TermTooltip term="총매출" />
              </p>
              <p className="text-xl sm:text-2xl font-bold text-slate-900">{fmt(data.sales.totalRevenue)}원</p>
              <p className="text-xs text-slate-500 mt-1">
                전월 대비: <span className={data.sales.momChangePct >= 0 ? 'text-sky-600' : 'text-rose-600'}>
                  {data.sales.momChangePct > 0 ? '+' : ''}{data.sales.momChangePct.toFixed(1)}%
                </span>
              </p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-sm text-slate-500 mb-1">부가세 포함 매출</p>
              <p className="text-xl sm:text-2xl font-bold text-slate-900">{fmt(data.sales.totalRevenueVatIncluded ?? 0)}원</p>
              <p className="text-xs text-slate-500 mt-1">
                서비스 금액: {fmt(data.sales.serviceAmount)}원
              </p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-sm text-slate-500 mb-1">영업일 / 일평균매출</p>
              <p className="text-lg sm:text-xl font-bold text-slate-900">{data.sales.openDays}일 / {fmtMan(data.sales.avgDailySales)}원</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-sm text-slate-500 mb-1">결제 비율</p>
              <p className="text-lg sm:text-xl font-bold text-slate-900">
                현금 {cashPct}% · 카드 {cardPct}%
              </p>
            </div>
          </div>
        </section>

        {/* Expense Summary */}
        <section>
          <h2 className="text-xl font-bold mb-4 border-l-4 border-slate-800 pl-3">비용 요약 (원가율·지출)</h2>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 flex justify-between items-center gap-4">
            <div>
              <p className="text-sm text-slate-500 mb-1 flex items-center">
                총비용 <TermTooltip term="총비용" />
              </p>
              <p className="text-2xl font-bold text-rose-600">{fmt(totalExpense)}원</p>
              <p className="text-xs text-slate-500 mt-0.5">매출 대비 {totalCostRatio.toFixed(1)}%</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-500 mb-1 flex items-center justify-end">
                원가율 (재료비) <TermTooltip term="원가율" />
              </p>
              <p className="text-2xl font-bold text-slate-900">{data.purchases.costRatio.toFixed(1)}%</p>
              <p className="text-xs text-slate-500 mt-0.5">재료비 {fmt(ingredientCost)}원</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500 flex items-center">
                원가율 <TermTooltip term="원가율" />
              </p>
              <p className="text-base font-bold text-slate-900 mt-0.5">{data.purchases.costRatio.toFixed(1)}%</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500 flex items-center">
                인건비율 <TermTooltip term="인건비율" />
              </p>
              <p className="text-base font-bold text-slate-900 mt-0.5">{(data.purchases.laborRatio ?? 0).toFixed(1)}%</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500 flex items-center">
                FL 비율 <TermTooltip term="FL 비율" />
              </p>
              <p className="text-base font-bold text-slate-900 mt-0.5">{(data.purchases.flRatio ?? 0).toFixed(1)}%</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500 flex items-center">
                임대료율 <TermTooltip term="임대료율" />
              </p>
              <p className="text-base font-bold text-slate-900 mt-0.5">{(data.purchases.rentRatio ?? 0).toFixed(1)}%</p>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            {(data.purchases.groups ?? []).map((g: any) => (
              <div key={g.key} className="flex items-center justify-between border-b border-slate-100 pb-2 gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-700">{g.label}</span>
                  <span className="text-xs text-slate-400">({g.ratioPct.toFixed(1)}%)</span>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-slate-800">{fmt(g.amount)}원</span>
                  {hasPrevData && g.momDiff !== 0 && (
                    <span className={`ml-2 text-xs font-medium ${g.momDiff > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                      {g.momDiff > 0 ? '+' : ''}
                      {fmtMan(g.momDiff)}원
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {data.purchases.categories?.length > 0 && (
            <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs">
              <summary className="cursor-pointer font-semibold text-slate-600 select-none">
                세부 비용 항목 보기 ({data.purchases.categories.length}개)
              </summary>
              <div className="mt-2 space-y-1.5 border-t border-slate-200 pt-2">
                {data.purchases.categories.map((c: any) => (
                  <div key={c.name} className="flex justify-between text-slate-600">
                    <span>{c.name}</span>
                    <span className="font-semibold text-slate-800">{fmt(c.amount)}원</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>

        {/* Profit Summary */}
        <section>
          <h2 className="text-xl font-bold mb-4 border-l-4 border-slate-800 pl-3">손익 계산서</h2>
          <div className="bg-slate-800 text-slate-100 p-5 rounded-2xl shadow-lg space-y-4">
            
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-sky-300 uppercase tracking-wide border-b border-slate-700 pb-1">
                매출 − 총비용 = 남은 돈 (영업이익)
              </h3>
              <div className="flex justify-between text-sm">
                <span className="text-slate-300 font-medium">총매출</span>
                <span className="font-semibold">{fmt(data.sales.totalRevenue)}원</span>
              </div>

              {(data.purchases.groups ?? []).map((g: any) => (
                <div key={g.key} className="flex items-center justify-between text-sm pl-2">
                  <span className="text-slate-400">
                    - {g.label}{' '}
                    <span className="text-xs text-slate-500">({g.ratioPct.toFixed(1)}%)</span>
                  </span>
                  <div className="text-right">
                    <span className="text-rose-300">-{fmt(g.amount)}원</span>
                    {hasPrevData && g.momDiff !== 0 && (
                      <span className={`ml-2 text-[11px] ${g.momDiff > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        ({g.momDiff > 0 ? '+' : ''}
                        {fmtMan(g.momDiff)})
                      </span>
                    )}
                  </div>
                </div>
              ))}

              <div className="flex justify-between text-sm pt-2 border-t border-slate-700/70">
                <span className="text-slate-300 font-medium">총비용 합계 (매출 대비 {totalCostRatio.toFixed(1)}%)</span>
                <span className="text-rose-400 font-semibold">-{fmt(totalExpense)}원</span>
              </div>

              <div className="flex justify-between items-baseline text-lg font-bold pt-2 border-t border-slate-600">
                <span>남은 돈 (영업이익)</span>
                <span className={data.profit.operatingProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {data.profit.operatingProfit >= 0 ? '+' : ''}{fmt(data.profit.operatingProfit)}원
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-xs">
                <div className="rounded-lg bg-slate-900/70 px-2.5 py-2">
                  <span className="text-slate-400 block">원가율(재료비)</span>
                  <span className="font-bold text-slate-100">{data.purchases.costRatio.toFixed(1)}%</span>
                </div>
                <div className="rounded-lg bg-slate-900/70 px-2.5 py-2">
                  <span className="text-slate-400 block">인건비율</span>
                  <span className="font-bold text-slate-100">{(data.purchases.laborRatio ?? 0).toFixed(1)}%</span>
                </div>
                <div className="rounded-lg bg-slate-900/70 px-2.5 py-2">
                  <span className="text-slate-400 block">FL 비율</span>
                  <span className="font-bold text-amber-300">{(data.purchases.flRatio ?? 0).toFixed(1)}%</span>
                </div>
                <div className="rounded-lg bg-slate-900/70 px-2.5 py-2">
                  <span className="text-slate-400 block">임대료율</span>
                  <span className="font-bold text-slate-100">{(data.purchases.rentRatio ?? 0).toFixed(1)}%</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-4">
              <h3 className="text-sm font-semibold text-rose-300 uppercase tracking-wide border-b border-slate-700 pb-1">영업외 지출</h3>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">대출금 상환</span>
                <span className="text-rose-400">-{fmt(data.profit.loanRepayment)}원</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">사장님 인건비</span>
                <span className="text-rose-400">-{fmt(data.profit.ownerSalary)}원</span>
              </div>
            </div>

            <div className="pt-4 border-t-2 border-slate-600 mt-2">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-base font-bold text-white flex items-center">
                    실질 순이익 <TermTooltip term="순이익" />
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">실제 내 손에 남는 돈 (총비용률 {totalCostRatio.toFixed(1)}%)</p>
                </div>
                <span className={`text-2xl font-black ${data.profit.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {data.profit.netProfit >= 0 ? '+' : ''}{fmt(data.profit.netProfit)}원
                </span>
              </div>
            </div>
            
          </div>
        </section>

        {/* Period Comparison */}
        {data.comparison && (
          <section>
            <h2 className="text-xl font-bold mb-4 border-l-4 border-slate-800 pl-3">기간 비교 분석</h2>
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-6">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[460px] text-sm text-center">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs">
                    <tr>
                      <th className="p-3 font-semibold text-left whitespace-nowrap">항목</th>
                      <th className="p-3 font-semibold whitespace-nowrap">
                        이번달
                        <br />
                        <span className="font-normal text-[10px]">
                          ({data.year}.{data.month}
                          {data.comparison.current.dataStatus === 'partial' ? ' · 일부' : ''})
                        </span>
                      </th>
                      <th className="p-3 font-semibold whitespace-nowrap">
                        전월 대비
                        <br />
                        <span className="font-normal text-[10px]">
                          {prevStatus === 'partial' ? '(일부 데이터)' : '(비교)'}
                        </span>
                      </th>
                      <th className="p-3 font-semibold whitespace-nowrap">
                        전년동월 대비
                        <br />
                        <span className="font-normal text-[10px]">
                          {lastYearStatus === 'partial' ? '(일부 데이터)' : '(비교)'}
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[
                      {
                        key: 'totalRevenue',
                        label: '총매출',
                        tooltip: '총매출',
                        kind: 'amount' as ComparisonMetricKind,
                        curr: data.comparison.current.totalRevenue,
                        prev: data.comparison.prev.totalRevenue,
                        last: data.comparison.lastYear.totalRevenue,
                        formatter: fmt,
                        suffix: '원',
                        invertColor: false,
                      },
                      {
                        key: 'totalExpense',
                        label: '총비용',
                        tooltip: '총비용',
                        kind: 'amount' as ComparisonMetricKind,
                        curr: data.comparison.current.totalExpense ?? data.comparison.current.totalPurchase,
                        prev: data.comparison.prev.totalExpense ?? data.comparison.prev.totalPurchase,
                        last: data.comparison.lastYear.totalExpense ?? data.comparison.lastYear.totalPurchase,
                        formatter: fmt,
                        suffix: '원',
                        invertColor: true,
                      },
                      ...(data.comparison.current.expenseGroups ?? [])
                        .filter((g: any) => {
                          const pAmt = data.comparison.prev.groupTotals?.[g.key] ?? 0;
                          const lAmt = data.comparison.lastYear.groupTotals?.[g.key] ?? 0;
                          return g.amount > 0 || pAmt > 0 || lAmt > 0;
                        })
                        .map((g: any) => ({
                          key: `group-${g.key}`,
                          label: `· ${g.label}`,
                          tooltip: undefined,
                          kind: 'amount' as ComparisonMetricKind,
                          curr: g.amount,
                          prev: data.comparison.prev.groupTotals?.[g.key] ?? 0,
                          last: data.comparison.lastYear.groupTotals?.[g.key] ?? 0,
                          formatter: fmt,
                          suffix: '원',
                          invertColor: true,
                          isSubRow: true,
                        })),
                      {
                        key: 'operatingProfit',
                        label: '남은 돈(영업이익)',
                        tooltip: '남은 돈',
                        kind: 'amount' as ComparisonMetricKind,
                        curr: data.comparison.current.operatingProfit,
                        prev: data.comparison.prev.operatingProfit,
                        last: data.comparison.lastYear.operatingProfit,
                        formatter: fmt,
                        suffix: '원',
                        invertColor: false,
                      },
                      {
                        key: 'costRatio',
                        label: '원가율(재료비)',
                        tooltip: '원가율',
                        kind: 'ratio' as ComparisonMetricKind,
                        curr: data.comparison.current.costRatio,
                        prev: data.comparison.prev.costRatio,
                        last: data.comparison.lastYear.costRatio,
                        formatter: (v: number) => v.toFixed(1),
                        suffix: '%',
                        invertColor: true,
                      },
                      {
                        key: 'laborRatio',
                        label: '인건비율',
                        tooltip: '인건비율',
                        kind: 'ratio' as ComparisonMetricKind,
                        curr: data.comparison.current.laborRatio ?? 0,
                        prev: data.comparison.prev.laborRatio ?? 0,
                        last: data.comparison.lastYear.laborRatio ?? 0,
                        formatter: (v: number) => v.toFixed(1),
                        suffix: '%',
                        invertColor: true,
                      },
                      {
                        key: 'flRatio',
                        label: 'FL 비율',
                        tooltip: 'FL 비율',
                        kind: 'ratio' as ComparisonMetricKind,
                        curr: data.comparison.current.flRatio ?? 0,
                        prev: data.comparison.prev.flRatio ?? 0,
                        last: data.comparison.lastYear.flRatio ?? 0,
                        formatter: (v: number) => v.toFixed(1),
                        suffix: '%',
                        invertColor: true,
                      },
                      {
                        key: 'rentRatio',
                        label: '임대료율',
                        tooltip: '임대료율',
                        kind: 'ratio' as ComparisonMetricKind,
                        curr: data.comparison.current.rentRatio ?? 0,
                        prev: data.comparison.prev.rentRatio ?? 0,
                        last: data.comparison.lastYear.rentRatio ?? 0,
                        formatter: (v: number) => v.toFixed(1),
                        suffix: '%',
                        invertColor: true,
                      },
                      {
                        key: 'totalCostRatio',
                        label: '총비용률',
                        tooltip: '총비용률',
                        kind: 'ratio' as ComparisonMetricKind,
                        curr: data.comparison.current.totalCostRatio ?? 0,
                        prev: data.comparison.prev.totalCostRatio ?? 0,
                        last: data.comparison.lastYear.totalCostRatio ?? 0,
                        formatter: (v: number) => v.toFixed(1),
                        suffix: '%',
                        invertColor: true,
                      },
                      {
                        key: 'operatingProfitRatio',
                        label: '영업이익률',
                        tooltip: '남은 돈',
                        kind: 'ratio' as ComparisonMetricKind,
                        curr: data.comparison.current.operatingProfitRatio ?? 0,
                        prev: data.comparison.prev.operatingProfitRatio ?? 0,
                        last: data.comparison.lastYear.operatingProfitRatio ?? 0,
                        formatter: (v: number) => v.toFixed(1),
                        suffix: '%',
                        invertColor: false,
                      },
                      {
                        key: 'avgDailySales',
                        label: '일평균매출',
                        kind: 'amount' as ComparisonMetricKind,
                        curr: data.comparison.current.avgDailySales,
                        prev: data.comparison.prev.avgDailySales,
                        last: data.comparison.lastYear.avgDailySales,
                        formatter: fmt,
                        suffix: '원',
                        invertColor: false,
                      },
                    ].map((row: any) => (
                      <tr key={row.key} className={row.isSubRow ? 'bg-slate-50/30 text-xs' : undefined}>
                        <td
                          className={`p-3 text-left whitespace-nowrap ${
                            row.isSubRow
                              ? 'pl-5 font-medium text-slate-500'
                              : 'font-semibold text-slate-700'
                          }`}
                        >
                          {row.label} {row.tooltip ? <TermTooltip term={row.tooltip} /> : null}
                        </td>
                        <td className="p-3 font-bold text-slate-900 whitespace-nowrap">
                          {row.formatter(row.curr)}{row.suffix}
                        </td>
                        <td className="p-3 bg-slate-50/50">
                          {hasPrevData ? (
                            <ComparisonCell
                              current={row.curr}
                              base={row.prev}
                              kind={row.kind}
                              hasBaseData={hasPrevData}
                              formatter={row.formatter}
                              suffix={row.suffix}
                              invertColor={row.invertColor}
                            />
                          ) : (
                            <span className="text-xs text-slate-400">데이터 없음</span>
                          )}
                        </td>
                        <td className="p-3">
                          {hasLastYearData ? (
                            <ComparisonCell
                              current={row.curr}
                              base={row.last}
                              kind={row.kind}
                              hasBaseData={hasLastYearData}
                              formatter={row.formatter}
                              suffix={row.suffix}
                              invertColor={row.invertColor}
                            />
                          ) : (
                            <span className="text-xs text-slate-400">데이터 없음</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td className="p-3 text-left font-semibold text-slate-700 whitespace-nowrap">
                        객단가 <TermTooltip term="객단가" />
                      </td>
                      <td className="p-3 font-bold text-slate-900 whitespace-nowrap">
                        {data.comparison.current.avgSpend > 0 ? `${fmt(data.comparison.current.avgSpend)}원` : '-'}
                      </td>
                      <td className="p-3 bg-slate-50/50">
                        {!hasPrevData ? (
                          <span className="text-xs text-slate-400">데이터 없음</span>
                        ) : data.comparison.current.avgSpend > 0 && data.comparison.prev.avgSpend > 0 ? (
                          <ComparisonCell current={data.comparison.current.avgSpend} base={data.comparison.prev.avgSpend} />
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="p-3">
                        {!hasLastYearData ? (
                          <span className="text-xs text-slate-400">데이터 없음</span>
                        ) : data.comparison.current.avgSpend > 0 && data.comparison.lastYear.avgSpend > 0 ? (
                          <ComparisonCell current={data.comparison.current.avgSpend} base={data.comparison.lastYear.avgSpend} />
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3 text-left font-semibold text-slate-700 whitespace-nowrap">영업일수</td>
                      <td className="p-3 font-bold text-slate-900 whitespace-nowrap">{data.comparison.current.openDays}일</td>
                      <td className="p-3 bg-slate-50/50">
                        {hasPrevData ? (
                          <ComparisonCell
                            current={data.comparison.current.openDays}
                            base={data.comparison.prev.openDays}
                            formatter={(v: number) => String(v)}
                            suffix="일"
                          />
                        ) : (
                          <span className="text-xs text-slate-400">데이터 없음</span>
                        )}
                      </td>
                      <td className="p-3">
                        {hasLastYearData ? (
                          <ComparisonCell
                            current={data.comparison.current.openDays}
                            base={data.comparison.lastYear.openDays}
                            formatter={(v: number) => String(v)}
                            suffix="일"
                          />
                        ) : (
                          <span className="text-xs text-slate-400">데이터 없음</span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* BEP Summary */}
        <section>
          <h2 className="text-xl font-bold mb-4 border-l-4 border-slate-800 pl-3">손익분기점 분석</h2>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
            <p className="text-xs text-slate-500">
              11월부터 변동비는 재료비·수수료로, 나머지는 고정비로 계산합니다(이전 보고서와 값이 다를 수 있음).
            </p>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">고정비 합계</span>
              <span className="font-semibold text-slate-800">{fmt(data.bep.fixedCostsSum)}원</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">평균 변동비율</span>
              <span className="font-semibold text-slate-800">{(data.bep.variableCostRatio * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
              <span className="font-bold text-slate-900 flex items-center">
                손익분기점 (BEP) <TermTooltip term="BEP(손익분기점)" />
              </span>
              <span className="font-bold text-slate-900">{fmt(data.bep.bep)}원</span>
            </div>
            {data.bep.bep > 0 && data.bep.currentRevenue > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 flex items-center">
                  안전마진율 <TermTooltip term="안전마진율" />
                </span>
                <span className="font-semibold text-slate-800">
                  {(((data.bep.currentRevenue - data.bep.bep) / data.bep.currentRevenue) * 100).toFixed(1)}%
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm mt-4">
              <span className="text-slate-500">현재 월매출</span>
              <span className="font-semibold text-slate-800">{fmt(data.bep.currentRevenue)}원</span>
            </div>
            <div className={`flex justify-between text-sm ${data.bep.bepShortfall > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              <span className="font-bold">{data.bep.bepShortfall > 0 ? '부족액' : '초과액'}</span>
              <span className="font-bold">{data.bep.bepShortfall > 0 ? '-' : '+'}{fmt(Math.abs(data.bep.bepShortfall))}원</span>
            </div>

            {/* BEP AI Diagnosis */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-4">
              <h3 className="text-xs font-bold text-amber-800 mb-2 flex items-center gap-1">
                <span>💡</span> AI 진단
              </h3>
              <div className="text-amber-900 font-medium text-sm leading-relaxed">
                <p className="whitespace-pre-line">{data.bep.aiDiagnosis}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Weather Correlation */}
        {data.weather?.stats?.length > 0 && (
          <section>
            <h2 className="text-xl font-bold mb-4 border-l-4 border-slate-800 pl-3">날씨별 평균 매출</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              {data.weather.stats.map((w: any) => (
                <div key={w.condition} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
                  <div className="text-2xl mb-1">{WEATHER_EMOJI[w.condition] || '☁️'}</div>
                  <div className="text-sm font-bold text-slate-800">{w.condition}</div>
                  <div className="text-xs text-slate-500 mb-2">{w.days}일</div>
                  <div className="text-sm font-semibold text-slate-900">{fmt(w.avgRevenue)}원</div>
                </div>
              ))}
            </div>
            
            {data.weather.aiDiagnosis && (
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
                <h3 className="text-xs font-bold text-sky-800 mb-2 flex items-center gap-1">
                  <span>💡</span> 날씨 AI 진단
                </h3>
                <div className="text-sky-900 font-medium text-sm leading-relaxed">
                  <p className="whitespace-pre-line">{data.weather.aiDiagnosis}</p>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Top 10 Menus & Top 5 Expenses */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <section>
            <h2 className="text-lg font-bold mb-3 border-l-4 border-slate-800 pl-2">매출 TOP 10 메뉴</h2>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
              {data.topMenus.map((m: any, i: number) => (
                <div key={m.name} className="flex justify-between text-sm items-start gap-2">
                  <span className="text-slate-700 break-words leading-snug">
                    <span className="text-slate-400 mr-1">{i + 1}.</span>
                    {m.name}
                  </span>
                  <span className="font-semibold shrink-0 whitespace-nowrap">{fmt(m.amount)}원</span>
                </div>
              ))}
              {data.topMenus.length === 0 && <p className="text-sm text-slate-400">데이터 없음</p>}
            </div>
          </section>
          
          <section>
            <h2 className="text-lg font-bold mb-3 border-l-4 border-slate-800 pl-2">지출 TOP 5</h2>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
              {data.topVendors.map((v: any, i: number) => (
                <div key={v.name} className="flex justify-between text-sm items-start gap-2">
                  <div className="min-w-0 leading-snug">
                    <span className="text-slate-700 break-words">
                      <span className="text-slate-400 mr-1">{i + 1}.</span>
                      {v.name}
                    </span>
                    {v.groupLabel && (
                      <span className="ml-1.5 inline-block rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-700 align-middle">
                        {v.groupLabel}
                      </span>
                    )}
                  </div>
                  <span className="font-semibold shrink-0 whitespace-nowrap text-rose-600">{fmt(v.amount)}원</span>
                </div>
              ))}
              {data.topVendors.length === 0 && <p className="text-sm text-slate-400">데이터 없음</p>}
            </div>
          </section>
        </div>

        {/* Day of Week */}
        <section>
          <h2 className="text-lg font-bold mb-3 border-l-4 border-slate-800 pl-2">요일별 평균 매출</h2>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex justify-between">
            {['일', '월', '화', '수', '목', '금', '토'].map((dow, idx) => (
              <div key={dow} className="text-center">
                <p className="text-xs font-semibold text-slate-500 mb-1">{dow}</p>
                <p className="text-sm font-bold text-slate-800">{fmtMan(data.dowAverages[idx])}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Next Month Prediction */}
        {data.prediction && (
          <section>
            <h2 className="text-xl font-bold mb-4 border-l-4 border-slate-800 pl-3">
              📈 다음달 예측 ({data.prediction.nextMonth}월)
            </h2>
            
            {!data.prediction.hasEnoughData && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm font-medium mb-4 flex gap-2">
                <span>⚠️</span>
                <span>데이터가 쌓일수록 예측 정확도가 높아집니다. (현재 6개월 미만)</span>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="mb-6">
                <h3 className="text-sm font-bold text-slate-500 mb-1">매출 예측 범위</h3>
                <div className="text-2xl font-bold text-indigo-600">
                  {fmt(data.prediction.predictedMin)}원 ~ {fmt(data.prediction.predictedMax)}원
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-6 mb-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-1">
                    <span>🔍</span> 예측 근거
                  </h3>
                  <ul className="text-sm text-slate-600 space-y-1.5 list-disc list-inside">
                    <li>{data.prediction.predictionBasis}</li>
                    <li>계절/날씨: {data.prediction.seasonality || '특이사항 없음'}</li>
                    <li>주말/공휴일: 주말 {data.prediction.weekendCount}일 {data.prediction.holidays.length > 0 ? `, ${data.prediction.holidays.join(', ')} 포함` : ''}</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-1">
                    <span>📦</span> 발주 권장 (현재 원가율 기준)
                  </h3>
                  <ul className="text-sm text-slate-600 space-y-1.5 list-disc list-inside">
                    <li>주류: {fmtMan(data.prediction.recommendedAlcohol)}원 수준 권장</li>
                    <li>식자재: {fmtMan(data.prediction.recommendedFood)}원 수준 권장</li>
                  </ul>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 mb-4 border border-slate-100">
                <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-1">
                  <span>💡</span> 기본 운영 제안
                </h3>
                <ul className="text-sm text-slate-600 space-y-1.5 list-disc list-inside">
                  <li>주말 집중 영업 및 프로모션 권장</li>
                  <li>평일 유휴 시간대 비용 절감 검토</li>
                </ul>
              </div>

              {data.prediction.aiDiagnosis && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-indigo-800 mb-2 flex items-center gap-1">
                    <span>🤖</span> AI 종합 예측 및 준비사항
                  </h3>
                  <div className="text-indigo-900 font-medium text-sm leading-relaxed">
                    <p className="whitespace-pre-line">{data.prediction.aiDiagnosis}</p>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="text-center pt-8 border-t border-slate-200">
          <p className="text-xs text-slate-500">
            마지막 업데이트: {new Date(data.generatedAt).toLocaleString('ko-KR')} <br/>
            데이터 추가/수정 후 재생성 가능합니다.
          </p>
        </footer>

      </main>
    </div>
  );
}

export default function MonthlyReportPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400 animate-pulse">보고서 준비 중...</div>}>
      <MonthlyReportContent />
    </Suspense>
  );
}
