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
  hasData: boolean;
  dataStatus: PeriodDataStatus;
  expenseGroups: ExpenseGroupSummary[];
  groupTotals: Record<ExpenseGroupKey, number>;
  expenseBreakdown: ExpenseBreakdown;
}

export const LOW_INPUT_RATE_THRESHOLD = 0.8;

export function calcPeriodStats(
  sales: Array<{ net_revenue?: number | null; tables_used?: number | null }>,
  purchases: Array<{ category?: string | null; total_amount?: number | null }>,
  expectedDays = 30,
  prevGroupTotals?: Partial<Record<ExpenseGroupKey, number>> | null
): PeriodStats {
  const totalRevenue = sales.reduce((sum, item) => sum + (item.net_revenue || 0), 0);
  const breakdown = calculateExpenseBreakdown(purchases, totalRevenue, prevGroupTotals);

  const openDays = sales.length;
  const purchaseCount = purchases.length;
  const avgDailySales = openDays > 0 ? Math.round(totalRevenue / openDays) : 0;
  const tablesUsed = sales.reduce((sum, item) => sum + (item.tables_used || 0), 0);
  const avgSpend = tablesUsed > 0 ? Math.round(totalRevenue / tablesUsed) : 0;
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
    hasData,
    dataStatus,
    expenseGroups: breakdown.groups,
    groupTotals: breakdown.groupTotals,
    expenseBreakdown: breakdown,
  };
}
