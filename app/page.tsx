'use client';

import { useEffect, useMemo, useState } from 'react';
import { calculateMovingAverage } from '@/lib/analytics/movingAverage';
import { calculateCostRatio } from '@/lib/analytics/costRatio';
import { diagnoseDailySales } from '@/lib/analytics/diagnosis';
import DiagnosisCard from '@/components/diagnosis/DiagnosisCard';
import MAChart from '@/components/charts/MAChart';
import BottomTabNav from '@/components/BottomTabNav';
import type { MAChartDataPoint, DataAvailability } from '@/components/charts/MAChart';
import type { DailySales } from '@/types/sales';

function calcNullableMA(values: (number | null)[], period: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    const window = values.slice(i - period + 1, i + 1);
    const nonNull = window.filter((v): v is number => v !== null);
    if (nonNull.length < Math.ceil(period / 2)) return null;
    return nonNull.reduce((a, b) => a + b, 0) / nonNull.length;
  });
}

export default function DashboardPage() {
  const [salesData, setSalesData] = useState<DailySales[]>([]);
  const [purchaseByDate, setPurchaseByDate] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    // 고정비 자동 삽입 (fire-and-forget, 오류 무시)
    fetch('/api/fixed-costs/apply', { method: 'POST' }).catch(() => {});
  }, []);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [salesRes, purchaseRes] = await Promise.all([
          fetch('/api/sales?days=120'),
          fetch('/api/purchases?days=120'),
        ]);
        const salesBody = await salesRes.json().catch(() => null);
        if (!salesRes.ok) throw new Error(salesBody?.error ?? `서버 오류 (${salesRes.status})`);
        setSalesData(salesBody.data ?? []);

        if (purchaseRes.ok) {
          const purchaseBody = await purchaseRes.json().catch(() => null);
          const records: { date: string; total_amount: number }[] = purchaseBody?.data ?? [];
          const byDate: Record<string, number> = {};
          for (const r of records) {
            byDate[r.date] = (byDate[r.date] ?? 0) + (r.total_amount ?? 0);
          }
          setPurchaseByDate(byDate);
        }
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  const chartData = useMemo((): MAChartDataPoint[] => {
    if (salesData.length === 0) return [];
    const revenues = salesData.map((d) => d.netRevenue);
    const costValues = salesData.map((d) => purchaseByDate[d.date] ?? null);
    const profitValues = salesData.map((d, i) => {
      const cost = costValues[i];
      return cost !== null ? d.netRevenue - cost : null;
    });

    const revMa5 = calculateMovingAverage(revenues, 5);
    const revMa20 = calculateMovingAverage(revenues, 20);
    const revMa60 = calculateMovingAverage(revenues, 60);
    const costMa5 = calcNullableMA(costValues, 5);
    const costMa20 = calcNullableMA(costValues, 20);
    const costMa60 = calcNullableMA(costValues, 60);
    const profitMa5 = calcNullableMA(profitValues, 5);
    const profitMa20 = calcNullableMA(profitValues, 20);
    const profitMa60 = calcNullableMA(profitValues, 60);

    return salesData.map((d, i) => ({
      date: d.date.slice(-5),
      revenueMa5: revMa5[i],
      revenueMa20: revMa20[i],
      revenueMa60: revMa60[i],
      costMa5: costMa5[i],
      costMa20: costMa20[i],
      costMa60: costMa60[i],
      profitMa5: profitMa5[i],
      profitMa20: profitMa20[i],
      profitMa60: profitMa60[i],
    }));
  }, [salesData, purchaseByDate]);

  const dataAvailability = useMemo((): DataAvailability => ({
    ma5: salesData.length >= 5,
    ma20: salesData.length >= 20,
    ma60: salesData.length >= 60,
  }), [salesData]);

  const diagnosis = useMemo(() => {
    if (salesData.length === 0) return null;
    const revenues = salesData.map((d) => d.netRevenue);
    const ma5 = calculateMovingAverage(revenues, 5);
    const ma20 = calculateMovingAverage(revenues, 20);
    const lastDay = salesData[salesData.length - 1];
    const todayRevenue = lastDay.netRevenue;

    const realCost = purchaseByDate[lastDay.date];
    const hasRealCost = realCost !== undefined;
    const todayCost = hasRealCost ? realCost : todayRevenue * 0.4;
    const todayProfit = todayRevenue - todayCost;
    const costRatio = calculateCostRatio(todayRevenue, todayCost);

    // For cost ratio trend, use real purchase if available, else estimate
    const costRatios = salesData.map((d) => {
      const cost = purchaseByDate[d.date] ?? d.netRevenue * 0.4;
      return calculateCostRatio(d.netRevenue, cost);
    });
    const costRatioMA5 = calculateMovingAverage(costRatios, 5);
    const lastCostRatioMA5 = costRatioMA5.slice(-5);
    const diag = diagnoseDailySales(todayRevenue, ma5, ma20, costRatio, lastCostRatioMA5);
    return {
      diagnosis: diag,
      todayProfit,
      costRatio,
      todayRevenue,
      avgSpend: lastDay.avgSpend,
      hasRealCost,
    };
  }, [salesData, purchaseByDate]);

  const recentDays = useMemo(
    () => [...salesData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 7),
    [salesData]
  );

  const monthSummary = useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonth = salesData.filter((d) => d.date.startsWith(ym));
    if (thisMonth.length === 0) return null;
    const totalRevenue = thisMonth.reduce((s, d) => s + d.netRevenue, 0);
    let totalCost = 0;
    let hasAnyReal = false;
    for (const d of thisMonth) {
      const real = purchaseByDate[d.date];
      if (real !== undefined) {
        totalCost += real;
        hasAnyReal = true;
      } else {
        totalCost += d.netRevenue * 0.4;
      }
    }
    return {
      days: thisMonth.length,
      totalRevenue,
      totalCost,
      totalProfit: totalRevenue - totalCost,
      costRatioPct: totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0,
      hasAnyReal,
    };
  }, [salesData, purchaseByDate]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-sky-400">📊 매장닥터</h1>
          <p className="text-xs text-slate-400">마감 진단</p>
        </div>
      </header>

      <main className="min-h-screen bg-slate-950 px-4 py-6 pb-32">
        <div className="mx-auto max-w-2xl space-y-6">
          <div>
            <p className="text-sm text-slate-400">
              오늘 ({new Date().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })})
            </p>
            <h2 className="mt-2 text-3xl font-bold text-slate-100">매장 진단</h2>
          </div>

          {loading ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-8 text-center">
              <p className="text-slate-400 text-sm">데이터 불러오는 중...</p>
            </div>
          ) : fetchError ? (
            <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 p-6">
              <p className="text-rose-300 text-sm font-medium">데이터 로드 실패</p>
              <p className="mt-1 text-rose-400/70 text-xs">{fetchError}</p>
            </div>
          ) : salesData.length === 0 ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-8 text-center space-y-3">
              <p className="text-4xl">📋</p>
              <p className="text-slate-300 font-semibold">아직 데이터가 없습니다</p>
              <p className="text-slate-500 text-sm">매출 탭에서 POS 영수증을 입력하면<br />여기에 진단이 표시됩니다</p>
              <a
                href="/sales"
                className="mt-2 inline-block rounded-2xl bg-sky-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-400"
              >
                매출 입력하기
              </a>
            </div>
          ) : (
            <>
              {diagnosis ? (
                <div className="space-y-1">
                  <DiagnosisCard
                    diagnosis={diagnosis.diagnosis}
                    todayProfit={diagnosis.todayProfit}
                    costRatio={diagnosis.costRatio}
                    avgSpend={diagnosis.avgSpend}
                  />
                  {!diagnosis.hasRealCost && (
                    <p className="text-center text-xs text-slate-500">
                      * 오늘 매입 내역이 없어 원가 40% 추정치를 사용합니다
                    </p>
                  )}
                </div>
              ) : null}

              {monthSummary && (
                <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-100">이번 달 현황</h3>
                    <span className="text-xs text-slate-500">{monthSummary.days}일 영업{!monthSummary.hasAnyReal && ' · 원가 추정'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-2xl bg-slate-950/80 p-4 text-center">
                      <p className="text-xs text-slate-400 mb-1">총 매출</p>
                      <p className="text-lg font-bold text-slate-100">{Math.round(monthSummary.totalRevenue / 10000)}만</p>
                    </div>
                    <div className="rounded-2xl bg-slate-950/80 p-4 text-center">
                      <p className="text-xs text-slate-400 mb-1">총 매입</p>
                      <p className="text-lg font-bold text-amber-400">{Math.round(monthSummary.totalCost / 10000)}만</p>
                    </div>
                    <div className="rounded-2xl bg-slate-950/80 p-4 text-center">
                      <p className="text-xs text-slate-400 mb-1">순이익</p>
                      <p className={`text-lg font-bold ${monthSummary.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {monthSummary.totalProfit >= 0 ? '+' : ''}{Math.round(monthSummary.totalProfit / 10000)}만
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-500"
                        style={{ width: `${Math.min(monthSummary.costRatioPct, 100).toFixed(1)}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">원가율 {monthSummary.costRatioPct.toFixed(1)}%</span>
                  </div>
                </div>
              )}

              {chartData.length >= 2 ? (
                <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5">
                  <h3 className="text-lg font-semibold text-slate-100">이동평균선</h3>
                  <div className="mt-4">
                    <MAChart data={chartData} availability={dataAvailability} />
                  </div>
                </div>
              ) : null}

              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
                <h3 className="text-lg font-semibold text-slate-100">최근 7일</h3>
                <div className="mt-4 space-y-3">
                  {recentDays.map((day, idx) => {
                    const dayRevenue = day.netRevenue;

                    return (
                      <div key={`${day.date}-${idx}`} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-slate-100">
                              {new Date(day.date + 'T00:00:00').toLocaleDateString('ko-KR', {
                                month: 'short',
                                day: 'numeric',
                                weekday: 'short',
                              })}
                            </p>
                            <p className="mt-1 text-sm text-slate-400">
                              테이블 {day.tablesUsed}개 · {day.guestCount}명
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-slate-100">
                              {(dayRevenue / 10000).toFixed(1)}만원
                            </p>
                            <p className="mt-1 text-xs text-slate-500">순매출</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <BottomTabNav />
    </>
  );
}
