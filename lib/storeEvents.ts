/**
 * 매장 사정(이벤트) 공통 상수·검증·공휴일 병합·기간 영향 분석 모듈 (1-N)
 */

import { getHolidaysInRange } from '@/lib/holidays';
import { getPaymentCount } from '@/lib/analytics/periodComparison';

export const STORE_EVENT_TYPES = [
  'holiday',
  'local_event',
  'military',
  'weather',
  'closure',
  'promotion',
  'other',
] as const;

export type StoreEventType = (typeof STORE_EVENT_TYPES)[number];

export const STORE_EVENT_IMPACTS = ['up', 'down', 'unknown'] as const;
export type StoreEventImpact = (typeof STORE_EVENT_IMPACTS)[number];

export interface StoreEventTypeMeta {
  key: StoreEventType;
  label: string;
  shortLabel: string;
  chartFill: string;
  chartStroke: string;
  badgeClass: string;
  darkBadgeClass: string;
}

export const STORE_EVENT_TYPE_META: Record<StoreEventType, StoreEventTypeMeta> = {
  holiday: {
    key: 'holiday',
    label: '명절·공휴일',
    shortLabel: '명절·공휴일',
    chartFill: 'rgba(168, 85, 247, 0.16)',
    chartStroke: 'rgba(192, 132, 252, 0.5)',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
    darkBadgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  },
  local_event: {
    key: 'local_event',
    label: '지역 행사',
    shortLabel: '지역 행사',
    chartFill: 'rgba(56, 189, 248, 0.16)',
    chartStroke: 'rgba(56, 189, 248, 0.5)',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-200',
    darkBadgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  },
  military: {
    key: 'military',
    label: '군부대(훈련·통제·휴가)',
    shortLabel: '군부대',
    chartFill: 'rgba(245, 158, 11, 0.18)',
    chartStroke: 'rgba(251, 191, 36, 0.55)',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    darkBadgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  },
  weather: {
    key: 'weather',
    label: '날씨·재해',
    shortLabel: '날씨·재해',
    chartFill: 'rgba(59, 130, 246, 0.16)',
    chartStroke: 'rgba(96, 165, 250, 0.5)',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    darkBadgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  },
  closure: {
    key: 'closure',
    label: '휴무·단축영업',
    shortLabel: '휴무·단축',
    chartFill: 'rgba(244, 63, 94, 0.16)',
    chartStroke: 'rgba(251, 113, 133, 0.5)',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
    darkBadgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  },
  promotion: {
    key: 'promotion',
    label: '매장 이벤트(할인·신메뉴)',
    shortLabel: '매장 이벤트',
    chartFill: 'rgba(16, 185, 129, 0.16)',
    chartStroke: 'rgba(52, 211, 153, 0.5)',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    darkBadgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  },
  other: {
    key: 'other',
    label: '기타',
    shortLabel: '기타',
    chartFill: 'rgba(148, 163, 184, 0.16)',
    chartStroke: 'rgba(148, 163, 184, 0.45)',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    darkBadgeClass: 'bg-slate-700/40 text-slate-300 border-slate-600',
  },
};

export const STORE_EVENT_IMPACT_LABELS: Record<StoreEventImpact, string> = {
  up: '매출 증가 예상',
  down: '감소 예상',
  unknown: '모름',
};

export interface StoreEventRecord {
  id: string;
  store_id: string;
  start_date: string;
  end_date: string;
  title: string;
  type: StoreEventType;
  impact: StoreEventImpact;
  recurring_yearly: boolean;
  memo: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  isAutoHoliday?: boolean;
}

const VALID_TYPE_SET = new Set<string>(STORE_EVENT_TYPES);
const VALID_IMPACT_SET = new Set<string>(STORE_EVENT_IMPACTS);

export function isValidEventType(v: unknown): v is StoreEventType {
  return typeof v === 'string' && VALID_TYPE_SET.has(v);
}

export function isValidEventImpact(v: unknown): v is StoreEventImpact {
  return typeof v === 'string' && VALID_IMPACT_SET.has(v);
}

export function isValidDateStr(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function validateStoreEventInput(input: {
  start_date?: unknown;
  end_date?: unknown;
  title?: unknown;
  type?: unknown;
  impact?: unknown;
  recurring_yearly?: unknown;
  memo?: unknown;
}): { ok: true; data: { start_date: string; end_date: string; title: string; type: StoreEventType; impact: StoreEventImpact; recurring_yearly: boolean; memo: string | null } } | { ok: false; error: string } {
  if (!isValidDateStr(input.start_date) || !isValidDateStr(input.end_date)) {
    return { ok: false, error: '시작일과 종료일은 YYYY-MM-DD 형식이어야 합니다.' };
  }
  if (input.end_date < input.start_date) {
    return { ok: false, error: '종료일은 시작일보다 빠를 수 없습니다.' };
  }
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (title.length < 1 || title.length > 40) {
    return { ok: false, error: '제목은 1자 이상 40자 이하로 입력해 주세요.' };
  }
  if (!isValidEventType(input.type)) {
    return { ok: false, error: '올바르지 않은 매장 사정 유형입니다.' };
  }
  const impact = input.impact === undefined || input.impact === '' ? 'unknown' : input.impact;
  if (!isValidEventImpact(impact)) {
    return { ok: false, error: '올바르지 않은 매출 영향 선택입니다.' };
  }
  const memo = typeof input.memo === 'string' && input.memo.trim() ? input.memo.trim() : null;
  if (memo && memo.length > 200) {
    return { ok: false, error: '메모는 200자 이하로 입력해 주세요.' };
  }
  return {
    ok: true,
    data: {
      start_date: input.start_date,
      end_date: input.end_date,
      title,
      type: input.type,
      impact,
      recurring_yearly: Boolean(input.recurring_yearly),
      memo,
    },
  };
}

/**
 * 매년 반복(recurring_yearly=true) DB 이벤트를 조회 범위 연도에 맞춰 투영하고,
 * 공휴일(holidays.ts)을 자동 합산해 날짜순으로 반환
 */
export function mergeStoreEventsWithHolidays(
  dbEvents: StoreEventRecord[],
  fromDate: string,
  toDate: string
): StoreEventRecord[] {
  const startYear = parseInt(fromDate.slice(0, 4), 10);
  const endYear = parseInt(toDate.slice(0, 4), 10);
  const merged: StoreEventRecord[] = [];
  const seenIds = new Set<string>();

  for (const ev of dbEvents) {
    if (ev.end_date >= fromDate && ev.start_date <= toDate) {
      merged.push(ev);
      seenIds.add(`${ev.id}::${ev.start_date}`);
    }
    if (ev.recurring_yearly && !isNaN(startYear) && !isNaN(endYear)) {
      const origStartYear = parseInt(ev.start_date.slice(0, 4), 10);
      const origEndYear = parseInt(ev.end_date.slice(0, 4), 10);
      const yearSpan = origEndYear - origStartYear;
      for (let y = startYear; y <= endYear; y++) {
        if (y === origStartYear) continue;
        const projStart = `${y}-${ev.start_date.slice(5)}`;
        const projEnd = `${y + yearSpan}-${ev.end_date.slice(5)}`;
        if (projEnd >= fromDate && projStart <= toDate) {
          const key = `${ev.id}::${projStart}`;
          if (!seenIds.has(key)) {
            seenIds.add(key);
            merged.push({
              ...ev,
              start_date: projStart,
              end_date: projEnd,
            });
          }
        }
      }
    }
  }

  for (const h of getHolidaysInRange(fromDate, toDate)) {
    merged.push({
      id: `auto-holiday-${h.startDate}-${h.title}`,
      store_id: 'auto',
      start_date: h.startDate,
      end_date: h.endDate,
      title: h.title,
      type: 'holiday',
      impact: 'unknown', // 상권별로 다르므로 단정하지 않음
      recurring_yearly: false,
      memo: null,
      created_by: null,
      created_at: '',
      updated_at: '',
      isAutoHoliday: true,
    });
  }

  return merged.sort((a, b) => a.start_date.localeCompare(b.start_date));
}

export interface EventPeriodSalesComparison {
  hasEvents: boolean;
  canCompare: boolean;
  eventDays: number;
  normalDays: number;
  eventAvgRevenue: number;
  normalAvgRevenue: number;
  revenueDiffPct: number | null;
  eventAvgPaymentCount: number | null;
  normalAvgPaymentCount: number | null;
}

/**
 * 이벤트 기간 일평균 vs 그 외 기간 일평균 비교 (1-N)
 * - 매출이 있는 날만 계산
 * - 여러 이벤트가 겹치면 하나라도 걸린 날은 이벤트 기간으로 분류
 * - 한쪽이라도 0일이면 canCompare=false ("비교 불가")
 */
export function analyzeEventPeriodSales(
  salesRows: Array<{
    date: string;
    net_revenue?: number | null;
    tables_used?: number | null;
    guest_count?: number | null;
  }>,
  events: StoreEventRecord[]
): EventPeriodSalesComparison {
  const validSales = salesRows.filter((s) => (s.net_revenue ?? 0) > 0);
  if (events.length === 0 || validSales.length === 0) {
    return {
      hasEvents: events.length > 0,
      canCompare: false,
      eventDays: 0,
      normalDays: validSales.length,
      eventAvgRevenue: 0,
      normalAvgRevenue: 0,
      revenueDiffPct: null,
      eventAvgPaymentCount: null,
      normalAvgPaymentCount: null,
    };
  }

  let eventRevSum = 0;
  let eventDays = 0;
  let eventPaySum = 0;
  let eventPayDays = 0;

  let normalRevSum = 0;
  let normalDays = 0;
  let normalPaySum = 0;
  let normalPayDays = 0;

  for (const s of validSales) {
    const isEventDay = events.some((ev) => ev.start_date <= s.date && s.date <= ev.end_date);
    const rev = s.net_revenue ?? 0;
    const pay = getPaymentCount(s);

    if (isEventDay) {
      eventDays += 1;
      eventRevSum += rev;
      if (pay !== null) {
        eventPaySum += pay;
        eventPayDays += 1;
      }
    } else {
      normalDays += 1;
      normalRevSum += rev;
      if (pay !== null) {
        normalPaySum += pay;
        normalPayDays += 1;
      }
    }
  }

  const canCompare = eventDays > 0 && normalDays > 0;
  const eventAvgRevenue = eventDays > 0 ? Math.round(eventRevSum / eventDays) : 0;
  const normalAvgRevenue = normalDays > 0 ? Math.round(normalRevSum / normalDays) : 0;
  const revenueDiffPct =
    canCompare && normalAvgRevenue > 0
      ? Number((((eventAvgRevenue - normalAvgRevenue) / normalAvgRevenue) * 100).toFixed(1))
      : null;

  return {
    hasEvents: true,
    canCompare,
    eventDays,
    normalDays,
    eventAvgRevenue,
    normalAvgRevenue,
    revenueDiffPct,
    eventAvgPaymentCount: eventPayDays > 0 ? Number((eventPaySum / eventPayDays).toFixed(1)) : null,
    normalAvgPaymentCount: normalPayDays > 0 ? Number((normalPaySum / normalPayDays).toFixed(1)) : null,
  };
}

export interface ClampedChartEventArea {
  id: string;
  x1: string;
  x2: string;
  title: string;
  type: StoreEventType;
  fill: string;
  stroke: string;
}

/**
 * ■ C. 차트 음영 클램핑:
 * ReferenceArea x1/x2는 차트 데이터에 실제 존재하는 날짜여야 하므로,
 * 이벤트 기간 내에 있는 차트 데이터 날짜 중 가장 앞선/마지막 날짜로 맞춘다.
 * 범위 안에 데이터가 하나도 없으면 그리지 않음(null 제외).
 */
export function clampEventsToChartDates(
  events: StoreEventRecord[],
  sortedChartDates: string[]
): ClampedChartEventArea[] {
  if (sortedChartDates.length === 0 || events.length === 0) return [];
  const areas: ClampedChartEventArea[] = [];

  for (const ev of events) {
    let x1: string | null = null;
    let x2: string | null = null;
    for (const d of sortedChartDates) {
      if (d >= ev.start_date && d <= ev.end_date) {
        if (x1 === null) x1 = d;
        x2 = d;
      }
    }
    if (!x1 || !x2) continue;
    const meta = STORE_EVENT_TYPE_META[ev.type] ?? STORE_EVENT_TYPE_META.other;
    areas.push({
      id: ev.id,
      x1,
      x2,
      title: ev.title,
      type: ev.type,
      fill: meta.chartFill,
      stroke: meta.chartStroke,
    });
  }

  return areas;
}

