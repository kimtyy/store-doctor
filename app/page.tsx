'use client';

import { useEffect, useMemo, useState } from 'react';
import { calculateMovingAverage } from '@/lib/analytics/movingAverage';
import { calculateCostRatio } from '@/lib/analytics/costRatio';
import { diagnoseDailySales } from '@/lib/analytics/diagnosis';
import DiagnosisCard from '@/components/diagnosis/DiagnosisCard';
import MAChart from '@/components/charts/MAChart';
import BottomTabNav from '@/components/BottomTabNav';
import type { MAChartDataPoint } from '@/components/charts/MAChart';
import type { DailySales } from '@/types/sales';

export default function DashboardPage() {
  const [salesData, setSalesData] = useState<DailySales[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSales() {
      try {
        const res = await fetch('/api/sales');
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? `서버 오류 (${res.status})`);
        setSalesData(body.data ?? []);
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    }
    fetchSales();
  }, []);

  const chartData = useMemo((): MAChartDataPoint[] => {
    if (salesData.length === 0) return [];
    const revenues = salesData.map((d) => d.netRevenue);
    const ma5 = calculateMovingAverage(revenues, 5);
    const ma20 = calculateMovingAverage(revenues, 20);
    const ma60 = calculateMovingAverage(revenues, 60);
    const ma120 = calculateMovingAverage(revenues, 120);

    return salesData.map((data, index) => ({
      date: data.date.slice(-5),
      revenue: data.netRevenue,
      ma5: ma5[index],
      ma20: ma20[index],
      ma60: ma60[index],
      ma120: ma120[index],
    }));
  }, [salesData]);

  const diagnosis = useMemo(() => {
    if (salesData.length === 0) return null;
    const revenues = salesData.map((d) => d.netRevenue);
    const ma5 = calculateMovingAverage(revenues, 5);
    const ma20 = calculateMovingAverage(revenues, 20);
    const todayRevenue = revenues[revenues.length - 1];
    const estimatedCost = todayRevenue * 0.4;
    const todayProfit = todayRevenue - estimatedCost;
    const costRatio = calculateCostRatio(todayRevenue, estimatedCost);
    const costRatios = revenues.map((rev) => calculateCostRatio(rev, rev * 0.4));
    const costRatioMA5 = calculateMovingAverage(costRatios, 5);
    const lastCostRatioMA5 = costRatioMA5.slice(-5);
    const diag = diagnoseDailySales(todayRevenue, ma5, ma20, costRatio, lastCostRatioMA5);
    return {
      diagnosis: diag,
      todayProfit,
      costRatio,
      todayRevenue,
      avgSpend: salesData[salesData.length - 1].avgSpend,
    };
  }, [salesData]);

  const recentDays = useMemo(() => salesData.slice(-7).reverse(), [salesData]);

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
                <DiagnosisCard
                  diagnosis={diagnosis.diagnosis}
                  todayProfit={diagnosis.todayProfit}
                  costRatio={diagnosis.costRatio}
                  avgSpend={diagnosis.avgSpend}
                />
              ) : null}

              {chartData.length >= 2 ? (
                <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5">
                  <h3 className="text-lg font-semibold text-slate-100">매출 추이</h3>
                  <p className="mt-1 text-xs text-slate-400">좌우로 스크롤하여 전체 추이를 확인하세요</p>
                  <div className="mt-6 -mx-5 overflow-x-auto">
                    <div className="min-w-max px-5" style={{ width: 'calc(100vw - 32px)' }}>
                      <MAChart data={chartData.slice(-60)} />
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
                <h3 className="text-lg font-semibold text-slate-100">최근 7일</h3>
                <div className="mt-4 space-y-3">
                  {recentDays.map((day, idx) => {
                    const dayRevenue = day.netRevenue;
                    const dayCost = dayRevenue * 0.4;
                    const dayProfit = dayRevenue - dayCost;

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
                            <p className="mt-1 text-sm text-slate-400">매출 {(dayRevenue / 10000).toFixed(0)}만원</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-lg font-bold ${dayProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {dayProfit >= 0 ? '+' : ''}{(dayProfit / 10000).toFixed(1)}만원
                            </p>
                            <p className="mt-1 text-xs text-slate-400">추정 수익</p>
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
