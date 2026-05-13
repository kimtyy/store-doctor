'use client';

import { useMemo } from 'react';
import { mockSalesData } from '@/lib/mock-data';
import { calculateMovingAverage } from '@/lib/analytics/movingAverage';
import { calculateCostRatio } from '@/lib/analytics/costRatio';
import { diagnoseDailySales } from '@/lib/analytics/diagnosis';
import DiagnosisCard from '@/components/diagnosis/DiagnosisCard';
import MAChart from '@/components/charts/MAChart';
import BottomTabNav from '@/components/BottomTabNav';
import type { MAChartDataPoint } from '@/components/charts/MAChart';

export default function DashboardPage() {
  const chartData = useMemo(() => {
    const revenues = mockSalesData.map((d) => d.netRevenue);
    const ma5 = calculateMovingAverage(revenues, 5);
    const ma20 = calculateMovingAverage(revenues, 20);
    const ma60 = calculateMovingAverage(revenues, 60);
    const ma120 = calculateMovingAverage(revenues, 120);

    return mockSalesData.map((data, index) => ({
      date: data.date.slice(-5), // MM-DD 형식
      revenue: data.netRevenue,
      ma5: ma5[index],
      ma20: ma20[index],
      ma60: ma60[index],
      ma120: ma120[index],
    })) as MAChartDataPoint[];
  }, []);

  const diagnosis = useMemo(() => {
    const revenues = mockSalesData.map((d) => d.netRevenue);
    const ma5 = calculateMovingAverage(revenues, 5);
    const ma20 = calculateMovingAverage(revenues, 20);

    // 오늘의 매입 비용 추정 (매출의 35~45% 정도)
    const todayRevenue = revenues[revenues.length - 1];
    const estimatedCost = todayRevenue * 0.4;
    const todayProfit = todayRevenue - estimatedCost;
    const costRatio = calculateCostRatio(todayRevenue, estimatedCost);

    // 원가율 5일선
    const costRatios = revenues.map((rev) => calculateCostRatio(rev, rev * 0.4));
    const costRatioMA5 = calculateMovingAverage(costRatios, 5);

    const lastCostRatioMA5 = costRatioMA5.slice(-5);

    const diagnosis = diagnoseDailySales(todayRevenue, ma5, ma20, costRatio, lastCostRatioMA5);

    return {
      diagnosis,
      todayProfit,
      costRatio,
      todayRevenue,
      avgSpend: mockSalesData[mockSalesData.length - 1].avgSpend,
    };
  }, []);

  const recentDays = useMemo(() => {
    return mockSalesData.slice(-7).reverse();
  }, []);

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
          {/* 헤더 */}
          <div>
            <p className="text-sm text-slate-400">
              오늘 ({new Date().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })})
            </p>
            <h2 className="mt-2 text-3xl font-bold text-slate-100">매장 진단</h2>
          </div>

          {/* 진단 카드 */}
          <DiagnosisCard
            diagnosis={diagnosis.diagnosis}
            todayProfit={diagnosis.todayProfit}
            costRatio={diagnosis.costRatio}
            avgSpend={diagnosis.avgSpend}
          />

          {/* 차트 섹션 */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5">
            <h3 className="text-lg font-semibold text-slate-100">매출 추이</h3>
            <p className="mt-1 text-xs text-slate-400">좌우로 스크롤하여 전체 추이를 확인하세요</p>
            <div className="mt-6 -mx-5 overflow-x-auto">
              <div className="min-w-max px-5" style={{ width: 'calc(100vw - 32px)' }}>
                <MAChart data={chartData.slice(-60)} />
              </div>
            </div>
          </div>

          {/* 최근 7일 요약 */}
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
                          {new Date(day.date).toLocaleDateString('ko-KR', {
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
                        <p className="mt-1 text-xs text-slate-400">수익</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      <BottomTabNav />
    </>
  );
}
