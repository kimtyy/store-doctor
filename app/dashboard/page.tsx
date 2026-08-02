'use client';

import { useEffect, useMemo, useState } from 'react';
import { calculateMovingAverage } from '@/lib/analytics/movingAverage';
import MAChart from '@/components/charts/MAChart';
import BottomTabNav from '@/components/BottomTabNav';
import PeriodSelector, { PeriodValue, MonthSelection } from '@/components/PeriodSelector';
import OnboardingGuideModal from '@/components/OnboardingGuideModal';
import TermTooltip from '@/components/ui/TermTooltip';
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

// ── Weather ──────────────────────────────────────────────────────────────────

interface WeatherInfo {
  emoji: string;
  text: string;
  temp: number;
  comment: string;
}

function getWeatherInfo(code: number, temp: number): WeatherInfo {
  if (code === 0)  return { emoji: '☀️',  text: '맑음',    temp, comment: '맑은 날씨 — 야외 활동이 늘어나는 시간대를 노려보세요' };
  if (code <= 2)   return { emoji: '🌤',  text: '구름 조금', temp, comment: '대체로 맑아 좋은 영업 날씨예요' };
  if (code === 3)  return { emoji: '☁️',  text: '흐림',    temp, comment: '흐린 날씨 — 평소와 비슷한 매출이 예상됩니다' };
  if (code <= 48)  return { emoji: '🌫',  text: '안개',    temp, comment: '안개 — 이른 시간 손님이 줄 수 있어요' };
  if (code <= 55)  return { emoji: '🌦',  text: '이슬비',   temp, comment: '이슬비 — 포장·배달 수요가 늘 수 있어요' };
  if (code <= 65)  return { emoji: '🌧',  text: '비',      temp, comment: '비 — 포장·배달 위주로 준비하세요' };
  if (code <= 75)  return { emoji: '❄️',  text: '눈',      temp, comment: '눈 — 도로 상황에 따라 방문이 줄 수 있어요' };
  if (code <= 82)  return { emoji: '🌦',  text: '소나기',   temp, comment: '소나기 예보 — 우산 준비를 권장해요' };
  return             { emoji: '⛈',   text: '천둥번개',  temp, comment: '악천후 — 매출에 영향이 있을 수 있어요' };
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmt만(n: number): string {
  return `${(n / 10000).toFixed(1)}만`;
}

function buildSalesApiUrl(pv: PeriodValue): string {
  if (pv.type === '7') {
    return '/api/sales?days=7&simple=true';
  }
  if (pv.type === '30') {
    return '/api/sales?days=30&simple=true';
  }
  if (pv.type === 'monthly' && pv.selectedMonth) {
    const { year, month } = pv.selectedMonth;
    const lastDay = new Date(year, month, 0).getDate();
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return `/api/sales?simple=true&from=${from}&to=${to}`;
  }
  if (pv.type === 'custom' && pv.customRange) {
    const { startDate, endDate } = pv.customRange;
    return `/api/sales?simple=true&from=${startDate}&to=${endDate}`;
  }
  return '/api/sales?simple=true';
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [salesData, setSalesData] = useState<DailySales[]>([]);
  const [purchaseByDate, setPurchaseByDate] = useState<Record<string, number>>({});
  const [eventPurchaseByDate, setEventPurchaseByDate] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [includeEvent, setIncludeEvent] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);

  useEffect(() => {
    fetch('/api/stores/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d?.data && d.data.onboarding_guide_seen === false) {
          setShowGuideModal(true);
        }
      })
      .catch(() => {});
  }, []);

  async function handleCloseGuideModal() {
    setShowGuideModal(false);
    try {
      await fetch('/api/stores/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboarding_guide_seen: true }),
      });
    } catch {}
  }

  // Bottom sales section independent period state & server fetch
  const [recentPeriodValue, setRecentPeriodValue] = useState<PeriodValue>(() => ({
    type: '7',
    selectedMonth: {
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
    },
  }));
  const [availableMonths, setAvailableMonths] = useState<MonthSelection[]>([]);
  const [recentSalesData, setRecentSalesData] = useState<DailySales[]>([]);
  const [recentSectionLoading, setRecentSectionLoading] = useState<boolean>(false);

  // KST Date formatting helpers for section titles
  const dateFormattedInfo = useMemo(() => {
    const now = new Date();
    const kstString = now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' });
    const kstDate = new Date(kstString);

    const month = kstDate.getMonth() + 1;
    const date = kstDate.getDate();
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const dow = weekdays[kstDate.getDay()];

    return {
      todayFormatted: `${month}월 ${date}일 (${dow})`,
      monthRangeFormatted: `${month}월 1일 ~ ${month}월 ${date}일`,
    };
  }, []);

  useEffect(() => {
    fetch('/api/analytics/months')
      .then((r) => r.json())
      .then((data) => {
        if (data.months) setAvailableMonths(data.months);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let ignore = false;
    async function fetchRecentSection() {
      setRecentSectionLoading(true);
      try {
        const url = buildSalesApiUrl(recentPeriodValue);
        const res = await fetch(url);
        const json = await res.json().catch(() => null);
        if (!ignore && res.ok && json?.data) {
          setRecentSalesData(json.data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!ignore) setRecentSectionLoading(false);
      }
    }
    fetchRecentSection();
    return () => {
      ignore = true;
    };
  }, [recentPeriodValue]);

  useEffect(() => {
    fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=37.8&longitude=127.7' +
      '&current=temperature_2m,weather_code&timezone=Asia%2FSeoul&forecast_days=1'
    )
      .then(r => r.json())
      .then(data => {
        const code = data.current?.weather_code ?? 0;
        const temp = Math.round(data.current?.temperature_2m ?? 0);
        setWeather(getWeatherInfo(code, temp));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [salesRes, purchaseRes] = await Promise.all([
          fetch('/api/sales?days=130&simple=true'),
          fetch('/api/purchases?days=130'),
        ]);
        const salesBody = await salesRes.json().catch(() => null);
        if (!salesRes.ok) throw new Error(salesBody?.error ?? `서버 오류 (${salesRes.status})`);
        setSalesData(salesBody.data ?? []);

        if (purchaseRes.ok) {
          const purchaseBody = await purchaseRes.json().catch(() => null);
          const records: { date: string; total_amount: number; is_event?: boolean }[] = purchaseBody?.data ?? [];
          const byDate: Record<string, number> = {};
          const eventByDate: Record<string, number> = {};
          for (const r of records) {
            if (!r.is_event) {
              byDate[r.date] = (byDate[r.date] ?? 0) + (r.total_amount ?? 0);
            } else {
              eventByDate[r.date] = (eventByDate[r.date] ?? 0) + (r.total_amount ?? 0);
            }
          }
          setPurchaseByDate(byDate);
          setEventPurchaseByDate(eventByDate);
        }
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  // MA chart data — is_event=false 데이터만 (행사 제외)
  const nonEventSalesData = useMemo(
    () => salesData.filter((d) => !d.isEvent),
    [salesData]
  );

  const chartData = useMemo((): MAChartDataPoint[] => {
    if (nonEventSalesData.length === 0) return [];
    const revenues = nonEventSalesData.map((d) => d.netRevenue);
    const costValues = nonEventSalesData.map((d) => purchaseByDate[d.date] ?? null);
    const profitValues = nonEventSalesData.map((d, i) => {
      const cost = costValues[i];
      return cost !== null ? d.netRevenue - cost : null;
    });

    const revMa5   = calculateMovingAverage(revenues, 5);
    const revMa20  = calculateMovingAverage(revenues, 20);
    const revMa60  = calculateMovingAverage(revenues, 60);
    const revMa120 = calculateMovingAverage(revenues, 120);
    const costMa5   = calcNullableMA(costValues, 5);
    const costMa20  = calcNullableMA(costValues, 20);
    const costMa60  = calcNullableMA(costValues, 60);
    const costMa120 = calcNullableMA(costValues, 120);
    const profitMa5   = calcNullableMA(profitValues, 5);
    const profitMa20  = calcNullableMA(profitValues, 20);
    const profitMa60  = calcNullableMA(profitValues, 60);
    const profitMa120 = calcNullableMA(profitValues, 120);

    const crValues = nonEventSalesData.map((d) => {
      const cost = purchaseByDate[d.date];
      return cost !== undefined && d.netRevenue > 0 ? (cost / d.netRevenue) * 100 : null;
    });
    const crMa5   = calcNullableMA(crValues, 5);
    const crMa20  = calcNullableMA(crValues, 20);
    const crMa60  = calcNullableMA(crValues, 60);
    const crMa120 = calcNullableMA(crValues, 120);

    return nonEventSalesData.map((d, i) => ({
      date: d.date.slice(-5),
      revenueMa5: revMa5[i],   revenueMa20: revMa20[i],   revenueMa60: revMa60[i],   revenueMa120: revMa120[i],
      costMa5: costMa5[i],     costMa20: costMa20[i],     costMa60: costMa60[i],     costMa120: costMa120[i],
      profitMa5: profitMa5[i], profitMa20: profitMa20[i], profitMa60: profitMa60[i], profitMa120: profitMa120[i],
      costRatioMa5: crMa5[i],  costRatioMa20: crMa20[i],  costRatioMa60: crMa60[i],  costRatioMa120: crMa120[i],
    }));
  }, [nonEventSalesData, purchaseByDate]);

  const dataAvailability = useMemo((): DataAvailability => ({
    ma5: nonEventSalesData.length >= 5,
    ma20: nonEventSalesData.length >= 20,
    ma60: nonEventSalesData.length >= 60,
    ma120: nonEventSalesData.length >= 120,
  }), [nonEventSalesData]);

  // Same weekday comparison — is_event=false 데이터만
  const sameDayComparison = useMemo(() => {
    if (nonEventSalesData.length === 0) return null;
    const today = new Date();
    const dow = today.getDay();
    const DOW_LABEL = ['일', '월', '화', '수', '목', '금', '토'];

    const salesMap: Record<string, number> = {};
    for (const d of nonEventSalesData) salesMap[d.date] = d.netRevenue;

    const lastWeekDate = new Date(today);
    lastWeekDate.setDate(today.getDate() - 7);
    const twoWeeksAgoDate = new Date(today);
    twoWeeksAgoDate.setDate(today.getDate() - 14);

    // Last month's same weekday average
    const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = prevMonthDate.getMonth();

    const lastMonthSameDay = nonEventSalesData.filter(d => {
      const date = new Date(d.date + 'T00:00:00');
      return date.getFullYear() === prevYear
        && date.getMonth() === prevMonth
        && date.getDay() === dow;
    });

    const lastMonthAvg = lastMonthSameDay.length > 0
      ? Math.round(lastMonthSameDay.reduce((s, d) => s + d.netRevenue, 0) / lastMonthSameDay.length)
      : null;

    return {
      dowLabel: DOW_LABEL[dow],
      lastWeek: salesMap[localDateStr(lastWeekDate)] ?? null,
      twoWeeksAgo: salesMap[localDateStr(twoWeeksAgoDate)] ?? null,
      lastMonthAvg,
      lastMonthCount: lastMonthSameDay.length,
    };
  }, [nonEventSalesData]);

  // Monthly summary — includeEvent 토글에 따라 행사 데이터 포함 여부 결정
  const monthSummary = useMemo(() => {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const todayDay = now.getDate();

    const ym = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    // 기본 (행사 제외)
    const baseMonth = nonEventSalesData.filter((d) => d.date.startsWith(ym));
    // 행사 데이터
    const eventMonth = salesData.filter((d) => d.isEvent && d.date.startsWith(ym));

    if (baseMonth.length === 0 && eventMonth.length === 0) return null;

    const baseRevenue = baseMonth.reduce((s, d) => s + d.netRevenue, 0);
    const eventRevenue = eventMonth.reduce((s, d) => s + d.netRevenue, 0);

    let baseCost = 0;
    for (const [date, amount] of Object.entries(purchaseByDate)) {
      if (date.startsWith(ym)) {
        baseCost += amount;
      }
    }

    let eventCost = 0;
    for (const [date, amount] of Object.entries(eventPurchaseByDate)) {
      if (date.startsWith(ym)) {
        eventCost += amount;
      }
    }

    const totalRevenue = includeEvent ? baseRevenue + eventRevenue : baseRevenue;
    const totalCost = includeEvent ? baseCost + eventCost : baseCost;

    // ── 전월 동기간 대비 계산 (MoM) ──
    const prevDate = new Date(currentYear, currentMonth - 2, 1);
    const prevYear = prevDate.getFullYear();
    const prevMonth = prevDate.getMonth() + 1;
    const prevYm = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
    const prevLastDay = new Date(prevYear, prevMonth, 0).getDate();
    const prevDayLimit = Math.min(todayDay, prevLastDay);

    // 전월 동기간 기본 매출
    const prevBaseMonth = nonEventSalesData.filter(
      (d) => d.date.startsWith(prevYm) && parseInt(d.date.split('-')[2], 10) <= prevDayLimit
    );
    // 전월 동기간 행사 매출
    const prevEventMonth = salesData.filter(
      (d) => d.isEvent && d.date.startsWith(prevYm) && parseInt(d.date.split('-')[2], 10) <= prevDayLimit
    );

    const prevBaseRev = prevBaseMonth.reduce((s, d) => s + d.netRevenue, 0);
    const prevEventRev = prevEventMonth.reduce((s, d) => s + d.netRevenue, 0);

    let prevBaseCost = 0;
    for (const [date, amount] of Object.entries(purchaseByDate)) {
      if (date.startsWith(prevYm)) {
        const day = parseInt(date.split('-')[2], 10);
        if (day <= prevDayLimit) {
          prevBaseCost += amount;
        }
      }
    }

    let prevEventCost = 0;
    for (const [date, amount] of Object.entries(eventPurchaseByDate)) {
      if (date.startsWith(prevYm)) {
        const day = parseInt(date.split('-')[2], 10);
        if (day <= prevDayLimit) {
          prevEventCost += amount;
        }
      }
    }

    const prevTotalRevenue = includeEvent ? prevBaseRev + prevEventRev : prevBaseRev;
    const prevTotalCost = includeEvent ? prevBaseCost + prevEventCost : prevBaseCost;

    const revenueChangePct = prevTotalRevenue > 0 ? ((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100 : 0;
    const costChangePct = prevTotalCost > 0 ? ((totalCost - prevTotalCost) / prevTotalCost) * 100 : 0;

    return {
      days: baseMonth.length,
      totalRevenue,
      totalCost,
      eventRevenue,
      eventCost,
      revenueChangePct,
      costChangePct,
      prevTotalRevenue,
      prevTotalCost,
    };
  }, [nonEventSalesData, salesData, purchaseByDate, eventPurchaseByDate, includeEvent]);

  // Filtered sales data for bottom section based on recentSalesData (server-fetched)
  const filteredRecentDays = useMemo(() => {
    const list = recentSalesData.filter((d) => !d.isEvent);
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [recentSalesData]);

  const sectionTotalRevenue = useMemo(
    () => filteredRecentDays.reduce((s, d) => s + d.netRevenue, 0),
    [filteredRecentDays]
  );

  const sectionTitle = useMemo(() => {
    if (recentPeriodValue.type === '7') return '최근 7일 매출';
    if (recentPeriodValue.type === '30') return '최근 30일 매출';
    if (recentPeriodValue.type === 'all') return '전체 기간 매출';
    if (recentPeriodValue.type === 'monthly' && recentPeriodValue.selectedMonth) {
      return `${recentPeriodValue.selectedMonth.year}년 ${recentPeriodValue.selectedMonth.month}월 매출`;
    }
    if (recentPeriodValue.type === 'custom' && recentPeriodValue.customRange) {
      return '선택 기간 매출';
    }
    return '매출 내역';
  }, [recentPeriodValue]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-sky-400">📊 매장닥터</h1>
          <p className="text-xs text-slate-400">
            {new Date().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })}
          </p>
        </div>
      </header>

      <main className="min-h-screen bg-slate-950 px-4 py-6 pb-32">
        <div className="mx-auto max-w-2xl space-y-5">

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
              <p className="text-slate-500 text-sm">매출 탭에서 POS 영수증을 입력하면<br />여기에 분석이 표시됩니다</p>
              <a
                href="/sales"
                className="mt-2 inline-block rounded-2xl bg-sky-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-400"
              >
                매출 입력하기
              </a>
            </div>
          ) : (
            <>
              {/* ── 오늘 영업 참고 ─────────────────────────────────────── */}
              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
                <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-baseline gap-2 flex-wrap">
                  <span>오늘 영업 참고</span>
                  <span className="text-xs font-normal text-slate-400">({dateFormattedInfo.todayFormatted})</span>
                </h2>

                {/* Weather */}
                {weather ? (
                  <div className="flex items-center gap-3 mb-5 rounded-2xl bg-slate-950/60 px-4 py-3">
                    <span className="text-3xl">{weather.emoji}</span>
                    <div>
                      <p className="text-sm font-semibold text-slate-100">
                        {weather.text}
                        <span className="ml-2 text-slate-400 font-normal">{weather.temp}°C</span>
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">{weather.comment}</p>
                    </div>
                  </div>
                ) : (
                  <div className="h-16 rounded-2xl bg-slate-800/40 animate-pulse mb-5" />
                )}

                {/* Same weekday comparison */}
                {sameDayComparison && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                      {sameDayComparison.dowLabel}요일 매출 비교
                    </p>
                    <div className="space-y-2">
                      {[
                        { label: `지난주 ${sameDayComparison.dowLabel}요일`, value: sameDayComparison.lastWeek },
                        { label: `2주 전 ${sameDayComparison.dowLabel}요일`, value: sameDayComparison.twoWeeksAgo },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-center justify-between rounded-xl px-3 py-2.5 bg-slate-950/50">
                          <span className="text-sm text-slate-400">{label}</span>
                          <span className="text-sm font-semibold text-slate-100">
                            {value !== null ? `${fmt만(value)}원` : <span className="text-slate-600">—</span>}
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between rounded-xl px-3 py-2.5 bg-slate-950/50">
                        <span className="text-sm text-slate-400">
                          지난달 {sameDayComparison.dowLabel}요일 평균
                        </span>
                        <span className="text-sm font-semibold text-slate-100">
                          {sameDayComparison.lastMonthAvg !== null ? (
                            <>
                              {fmt만(sameDayComparison.lastMonthAvg)}원
                              <span className="text-xs text-slate-500 ml-1">({sameDayComparison.lastMonthCount}회)</span>
                            </>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── 이번달 현황 ────────────────────────────────────────── */}
              {monthSummary && (
                <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h3 className="text-lg font-semibold text-slate-100 flex items-baseline gap-2 flex-wrap">
                      <span>이번달 현황</span>
                      <span className="text-xs font-normal text-slate-400">({dateFormattedInfo.monthRangeFormatted})</span>
                    </h3>
                    <div className="flex items-center gap-2">
                      {/* 행사 포함 토글 */}
                      <button
                        type="button"
                        onClick={() => setIncludeEvent((v) => !v)}
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                          includeEvent
                            ? 'bg-purple-500/20 border border-purple-500/40 text-purple-300'
                            : 'bg-slate-800 border border-slate-700 text-slate-400'
                        }`}
                      >
                        <span>🎪</span>
                        <span>행사 포함</span>
                        <span className={`w-7 h-3.5 rounded-full relative inline-block ml-1 ${
                          includeEvent ? 'bg-purple-500' : 'bg-slate-700'
                        }`}>
                          <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${
                            includeEvent ? 'left-3.5' : 'left-0.5'
                          }`} />
                        </span>
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-2xl bg-slate-950/80 p-4 text-center">
                      <p className="text-xs text-slate-400 mb-1">영업일</p>
                      <p className="text-xl font-bold text-slate-100">
                        {monthSummary.days}
                        <span className="text-sm font-normal text-slate-400">일</span>
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-950/80 p-4 text-center">
                      <p className="text-xs text-slate-400 mb-1 flex items-center justify-center">
                        총 매출 <TermTooltip term="총매출" />
                      </p>
                      <p className="text-lg font-bold text-slate-100">
                        {Math.round(monthSummary.totalRevenue / 10000)}만
                      </p>
                      {monthSummary.prevTotalRevenue > 0 && (
                        <p className={`text-[10px] font-bold mt-1.5 ${
                          monthSummary.revenueChangePct > 0 
                            ? 'text-emerald-400' 
                            : monthSummary.revenueChangePct < 0 
                            ? 'text-rose-400' 
                            : 'text-slate-400'
                        }`}>
                          {monthSummary.revenueChangePct > 0 ? '↑' : monthSummary.revenueChangePct < 0 ? '↓' : '-'} {Math.abs(monthSummary.revenueChangePct).toFixed(1)}%
                        </p>
                      )}
                    </div>
                    <div className="rounded-2xl bg-slate-950/80 p-4 text-center">
                      <p className="text-xs text-slate-400 mb-1 flex items-center justify-center">
                        총 매입 <TermTooltip term="총매입" />
                      </p>
                      <p className="text-lg font-bold text-amber-400">
                        {Math.round(monthSummary.totalCost / 10000)}만
                      </p>
                      {monthSummary.prevTotalCost > 0 && (
                        <p className={`text-[10px] font-bold mt-1.5 ${
                          monthSummary.costChangePct > 0 
                            ? 'text-rose-400' 
                            : monthSummary.costChangePct < 0 
                            ? 'text-emerald-400' 
                            : 'text-slate-400'
                        }`}>
                          {monthSummary.costChangePct > 0 ? '↑' : monthSummary.costChangePct < 0 ? '↓' : '-'} {Math.abs(monthSummary.costChangePct).toFixed(1)}%
                        </p>
                      )}
                    </div>
                  </div>
                  {/* 행사 매출/매입 별도 표시 (includeEvent ON + 데이터 있을 때) */}
                  {includeEvent && (monthSummary.eventRevenue > 0 || monthSummary.eventCost > 0) && (
                    <div className="mt-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 px-4 py-3 flex flex-wrap gap-3">
                      <span className="text-xs font-semibold text-purple-300">🎪 행사 포함</span>
                      {monthSummary.eventRevenue > 0 && (
                        <span className="text-xs text-purple-200">
                          행사 매출 <span className="font-bold">+{Math.round(monthSummary.eventRevenue / 10000)}만원</span>
                        </span>
                      )}
                      {monthSummary.eventCost > 0 && (
                        <span className="text-xs text-purple-200">
                          행사 매입 <span className="font-bold">+{Math.round(monthSummary.eventCost / 10000)}만원</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── 이동평균선 차트 ────────────────────────────────────── */}
              {chartData.length >= 2 && (
                <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5">
                  <h3 className="text-lg font-semibold text-slate-100 flex items-center">
                    이동평균선 <TermTooltip term="이동평균선" />
                  </h3>
                  <div className="mt-4">
                    <MAChart data={chartData} availability={dataAvailability} />
                  </div>
                </div>
              )}

              {/* ── 기간별 매출 내역 ───────────────────────────────────── */}
              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-slate-100">{sectionTitle}</h3>
                  {filteredRecentDays.length > 0 && (
                    <span className="text-xs font-semibold text-sky-400 bg-sky-950/60 border border-sky-800/50 rounded-full px-3 py-1 self-start sm:self-auto">
                      합계: {(sectionTotalRevenue / 10000).toFixed(1)}만원 ({filteredRecentDays.length}일)
                    </span>
                  )}
                </div>

                <PeriodSelector
                  value={recentPeriodValue}
                  onChange={setRecentPeriodValue}
                  availableMonths={availableMonths}
                />

                <div className="mt-4 space-y-3">
                  {recentSectionLoading ? (
                    <div className="py-8 text-center text-slate-400 text-sm animate-pulse">
                      데이터 불러오는 중...
                    </div>
                  ) : filteredRecentDays.length === 0 ? (
                    <div className="py-8 text-center text-slate-500 text-sm border border-dashed border-slate-800 rounded-2xl">
                      해당 기간에 등록된 매출 데이터가 없습니다.
                    </div>
                  ) : (
                    filteredRecentDays.map((day, idx) => (
                      <div key={`${day.date}-${idx}`} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 hover:border-slate-700 transition">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-slate-100">
                              {new Date(day.date + 'T00:00:00').toLocaleDateString('ko-KR', {
                                month: 'short', day: 'numeric', weekday: 'short',
                              })}
                            </p>
                            <p className="mt-1 text-sm text-slate-400">
                              테이블 {day.tablesUsed}개
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-slate-100">
                              {(day.netRevenue / 10000).toFixed(1)}만원
                            </p>
                            <p className="mt-1 text-xs text-slate-500">순매출</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <BottomTabNav />

      <OnboardingGuideModal
        isOpen={showGuideModal}
        onClose={handleCloseGuideModal}
      />
    </>
  );
}
