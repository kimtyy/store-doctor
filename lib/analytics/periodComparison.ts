import {
  calculateExpenseBreakdown,
  ExpenseBreakdown,
  ExpenseGroupKey,
  ExpenseGroupSummary,
} from '@/lib/expenses';

export type PeriodDataStatus = 'none' | 'partial' | 'complete';

export interface PeriodBounds {
  year: number;
  month: number;
  from: string;
  to: string;
  daysInMonth: number;
  expectedDays: number;
}

export interface ComparisonPeriodBounds {
  current: PeriodBounds;
  prev: PeriodBounds;
  lastYear: PeriodBounds;
  past6MonthFromStr: string;
  nextMonth: {
    year: number;
    month: number;
    daysInMonth: number;
    lastYearFrom: string;
    lastYearTo: string;
  };
}

export function getComparisonPeriodBounds(
  year: number,
  month: number,
  todayKst?: Date
): ComparisonPeriodBounds {
  const today =
    todayKst ?? new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();

  const isViewingCurrentMonth = year === todayYear && month === todayMonth;

  const daysInMonth = new Date(year, month, 0).getDate();
  const dayLimit = isViewingCurrentMonth ? Math.min(todayDay, daysInMonth) : daysInMonth;
  const currentFrom = `${year}-${String(month).padStart(2, '0')}-01`;
  const currentTo = `${year}-${String(month).padStart(2, '0')}-${String(dayLimit).padStart(2, '0')}`;

  // Previous month bounds
  const prevDate = new Date(year, month - 2, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = prevDate.getMonth() + 1;
  const prevDaysInMonth = new Date(prevYear, prevMonth, 0).getDate();
  const prevDayLimit = isViewingCurrentMonth ? Math.min(todayDay, prevDaysInMonth) : prevDaysInMonth;
  const prevFrom = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
  const prevTo = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(prevDayLimit).padStart(2, '0')}`;

  // Last year same month bounds
  const lastYear = year - 1;
  const lastYearDaysInMonth = new Date(lastYear, month, 0).getDate();
  const lastYearDayLimit = isViewingCurrentMonth
    ? Math.min(todayDay, lastYearDaysInMonth)
    : lastYearDaysInMonth;
  const lastYearFrom = `${lastYear}-${String(month).padStart(2, '0')}-01`;
  const lastYearTo = `${lastYear}-${String(month).padStart(2, '0')}-${String(lastYearDayLimit).padStart(2, '0')}`;

  // Past 6 months start
  const past6MonthDate = new Date(year, month - 6, 1);
  const past6MonthFromStr = `${past6MonthDate.getFullYear()}-${String(
    past6MonthDate.getMonth() + 1
  ).padStart(2, '0')}-01`;

  // Next month & its previous year range
  const nextMonthDate = new Date(year, month, 1);
  const nextMonthYear = nextMonthDate.getFullYear();
  const nextMonth = nextMonthDate.getMonth() + 1;
  const nextMonthLastDay = new Date(nextMonthYear, nextMonth, 0).getDate();
  const nextMonthLastYearFrom = `${nextMonthYear - 1}-${String(nextMonth).padStart(2, '0')}-01`;
  const nextMonthLastYearLastDay = new Date(nextMonthYear - 1, nextMonth, 0).getDate();
  const nextMonthLastYearTo = `${nextMonthYear - 1}-${String(nextMonth).padStart(2, '0')}-${String(
    nextMonthLastYearLastDay
  ).padStart(2, '0')}`;

  return {
    current: {
      year,
      month,
      from: currentFrom,
      to: currentTo,
      daysInMonth,
      expectedDays: dayLimit,
    },
    prev: {
      year: prevYear,
      month: prevMonth,
      from: prevFrom,
      to: prevTo,
      daysInMonth: prevDaysInMonth,
      expectedDays: prevDayLimit,
    },
    lastYear: {
      year: lastYear,
      month,
      from: lastYearFrom,
      to: lastYearTo,
      daysInMonth: lastYearDaysInMonth,
      expectedDays: lastYearDayLimit,
    },
    past6MonthFromStr,
    nextMonth: {
      year: nextMonthYear,
      month: nextMonth,
      daysInMonth: nextMonthLastDay,
      lastYearFrom: nextMonthLastYearFrom,
      lastYearTo: nextMonthLastYearTo,
    },
  };
}

export interface PeriodStats {
  totalRevenue: number;
  totalExpense: number;
  totalPurchase: number; // backward compat alias for totalExpense
  ingredientCost: number;
  laborCost: number;
  rentCost: number;
  flCost: number;
  operatingProfit: number;
  costRatio: number; // 재료비 기준 원가율 (%)
  laborRatio: number;
  flRatio: number;
  rentRatio: number;
  totalCostRatio: number; // 총비용률 (%)
  operatingProfitRatio: number;
  openDays: number;
  expectedDays: number;
  inputRate: number;
  purchaseCount: number;
  avgDailySales: number;
  avgSpend: number;
  tablesUsed: number;
  paymentDaysCount: number;
  paymentDataStatus: PeriodDataStatus;
  hasData: boolean;
  dataStatus: PeriodDataStatus;
  expenseGroups: ExpenseGroupSummary[];
  groupTotals: Record<ExpenseGroupKey, number>;
  expenseBreakdown: ExpenseBreakdown;
}

export const LOW_INPUT_RATE_THRESHOLD = 0.8;

/**
 * 결제 건수 입력 폴백 공통 함수 (1-L2)
 * tablesUsed > 0 ? tablesUsed : (guestCount > 0 ? guestCount : 0)
 */
export function resolvePaymentCountInput(
  tablesUsed?: number | null,
  guestCount?: number | null
): number {
  const tables = Number(tablesUsed ?? 0) || 0;
  if (tables > 0) return tables;
  const guests = Number(guestCount ?? 0) || 0;
  if (guests > 0) return guests;
  return 0;
}

/**
 * 결제 1건당 매출 서버/클라이언트 공통 계산 (순매출 기준)
 * round(netRevenue ÷ paymentCount), 건수 없으면 0
 */
export function calcServerAvgSpend(netRevenue: number, paymentCount: number): number {
  if (paymentCount <= 0 || netRevenue <= 0) return 0;
  return Math.round(netRevenue / paymentCount);
}

/**
 * 결제 건수(tables_used) 읽기 폴백 단일 공통 함수 (1-L 후속)
 * - DB 과거 행을 수정하지 않고, tables_used 우선 → 없으면 guest_count 폴백 → 둘 다 0/없으면 null
 */
export function getPaymentCount(row: {
  tables_used?: number | null;
  guest_count?: number | null;
  tablesUsed?: number | null;
  guestCount?: number | null;
}): number | null {
  const count = resolvePaymentCountInput(
    row.tables_used ?? row.tablesUsed,
    row.guest_count ?? row.guestCount
  );
  return count > 0 ? count : null;
}

export function calcPeriodStats(
  sales: Array<{
    net_revenue?: number | null;
    tables_used?: number | null;
    guest_count?: number | null;
    tablesUsed?: number | null;
    guestCount?: number | null;
  }>,
  purchases: Array<{ category?: string | null; total_amount?: number | null }>,
  expectedDays = 30,
  prevGroupTotals?: Partial<Record<ExpenseGroupKey, number>> | null
): PeriodStats {
  const totalRevenue = sales.reduce((sum, item) => sum + (item.net_revenue || 0), 0);
  const breakdown = calculateExpenseBreakdown(purchases, totalRevenue, prevGroupTotals);

  const openDays = sales.length;
  const purchaseCount = purchases.length;
  const avgDailySales = openDays > 0 ? Math.round(totalRevenue / openDays) : 0;

  // 결제 건수가 있는 날만 분자(매출)·분모(결제 건수)에 모두 포함 (건수 없는 날 제외)
  let tablesUsed = 0;
  let paymentRevSum = 0;
  let paymentDaysCount = 0;
  for (const item of sales) {
    const cnt = getPaymentCount(item);
    if (cnt !== null) {
      tablesUsed += cnt;
      paymentRevSum += item.net_revenue || 0;
      paymentDaysCount += 1;
    }
  }
  const avgSpend = tablesUsed > 0 ? Math.round(paymentRevSum / tablesUsed) : 0;
  const paymentDataStatus: PeriodDataStatus =
    openDays === 0 || paymentDaysCount === 0
      ? 'none'
      : paymentDaysCount < openDays
        ? 'partial'
        : 'complete';

  const hasData = openDays > 0 || purchaseCount > 0;
  const inputRate = expectedDays > 0 ? openDays / expectedDays : 0;

  let dataStatus: PeriodDataStatus = 'complete';
  if (!hasData) {
    dataStatus = 'none';
  } else if (openDays === 0 || purchaseCount === 0 || inputRate < LOW_INPUT_RATE_THRESHOLD) {
    dataStatus = 'partial';
  }

  return {
    totalRevenue,
    totalExpense: breakdown.totalExpense,
    totalPurchase: breakdown.totalExpense,
    ingredientCost: breakdown.ingredientCost,
    laborCost: breakdown.laborCost,
    rentCost: breakdown.rentCost,
    flCost: breakdown.flCost,
    operatingProfit: breakdown.operatingProfit,
    costRatio: breakdown.costRatio,
    laborRatio: breakdown.laborRatio,
    flRatio: breakdown.flRatio,
    rentRatio: breakdown.rentRatio,
    totalCostRatio: breakdown.totalCostRatio,
    operatingProfitRatio: breakdown.operatingProfitRatio,
    openDays,
    expectedDays,
    inputRate,
    purchaseCount,
    avgDailySales,
    avgSpend,
    tablesUsed,
    paymentDaysCount,
    paymentDataStatus,
    hasData,
    dataStatus,
    expenseGroups: breakdown.groups,
    groupTotals: breakdown.groupTotals,
    expenseBreakdown: breakdown,
  };
}

export type ComparisonMetricKind = 'amount' | 'ratio';

export interface MetricDelta {
  kind: ComparisonMetricKind;
  diff: number;
  pct: number | null;
  formatted: string;
}

/**
 * 결제 건수 합계 증감 비교 공통 함수 (1-L3)
 * - 이번 달·비교 대상 중 하나라도 paymentDataStatus === 'partial' 이면 증감을 "-"로 반환
 */
export function calcPaymentCountComparison(
  current: Pick<PeriodStats, 'tablesUsed' | 'paymentDataStatus'>,
  base: Pick<PeriodStats, 'tablesUsed' | 'paymentDataStatus' | 'hasData'>
): { canCompare: boolean; formatted: string } {
  if (
    !base.hasData ||
    current.tablesUsed <= 0 ||
    base.tablesUsed <= 0 ||
    current.paymentDataStatus === 'partial' ||
    base.paymentDataStatus === 'partial'
  ) {
    return { canCompare: false, formatted: '-' };
  }
  return {
    canCompare: true,
    formatted: calcComparisonMetricDelta(current.tablesUsed, base.tablesUsed, 'amount', true).formatted,
  };
}

/**
 * 기간 비교 지표의 증감 계산/포맷 공통 함수
 * - amount: 변화율(%) — 예: +12.3%, −50.0%
 * - ratio: %p 차이 — 예: +7.1%p, −5.7%p
 */
export function calcComparisonMetricDelta(
  current: number,
  base: number,
  kind: ComparisonMetricKind,
  hasBaseData = true
): MetricDelta {
  if (!hasBaseData) {
    return { kind, diff: 0, pct: null, formatted: '-' };
  }
  if (kind === 'ratio') {
    const c1 = Math.round(current * 10) / 10;
    const b1 = Math.round(base * 10) / 10;
    const rounded = Math.round((c1 - b1) * 10) / 10;
    const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
    return {
      kind,
      diff: rounded,
      pct: null,
      formatted: `${sign}${Math.abs(rounded).toFixed(1)}%p`,
    };
  }
  const diff = current - base;
  if (!base || base === 0) {
    return { kind, diff, pct: null, formatted: '-' };
  }
  const pct = ((current - base) / base) * 100;
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
  return {
    kind,
    diff,
    pct,
    formatted: `${sign}${Math.abs(rounded).toFixed(1)}%`,
  };
}
