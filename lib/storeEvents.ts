/**
 * 매장 사정(이벤트) 공통 상수·검증·공휴일 병합·기간 영향 분석 모듈 (1-N / 1-N2)
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
    label: '주변 기관 일정(군부대·학교·공장 등)',
    shortLabel: '주변 기관',
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
  if (input.type === 'holiday' && Boolean(input.recurring_yearly)) {
    return {
      ok: false,
      error: '명절·공휴일은 매년 날짜가 바뀌어 자동 표시되므로 매년 반복을 설정할 수 없습니다.',
    };
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
 * 공휴일(holidays.ts)을 자동 합산해 날짜순으로 반환.
 * - 사용자가 type='holiday'로 기록한 행과 기간이 겹치는 자동 공휴일은 사용자 기록을 우선하고 자동 줄을 생략(중복 방지).
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
    if (ev.recurring_yearly && ev.type !== 'holiday' && !isNaN(startYear) && !isNaN(endYear)) {
      const origStartYear = parseInt(ev.start_date.slice(0, 4), 10);
      const origEndYear = parseInt(ev.end_date.slice(0, 4), 10);
      const yearSpan = origEndYear - origStartYear;
      for (let y = startYear - 1; y <= endYear + 1; y++) {
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

  const userHolidays = merged.filter((e) => e.type === 'holiday');

  const addDaysIso = (iso: string, delta: number): string => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  };

  for (const h of getHolidaysInRange(fromDate, toDate)) {
    const remainingDates: string[] = [];
    for (let cur = h.startDate; cur <= h.endDate; cur = addDaysIso(cur, 1)) {
      const covered = userHolidays.some((uh) => uh.start_date <= cur && cur <= uh.end_date);
      if (!covered) {
        remainingDates.push(cur);
      }
    }
    if (remainingDates.length === 0) continue;

    // 겹치는 날만 제외하고 남은 날을 연속 구간으로 다시 묶음
    const segments: Array<{ start: string; end: string }> = [];
    let segStart = remainingDates[0];
    let segEnd = remainingDates[0];
    for (let i = 1; i < remainingDates.length; i++) {
      const expectedNext = addDaysIso(segEnd, 1);
      if (remainingDates[i] === expectedNext) {
        segEnd = remainingDates[i];
      } else {
        segments.push({ start: segStart, end: segEnd });
        segStart = remainingDates[i];
        segEnd = remainingDates[i];
      }
    }
    segments.push({ start: segStart, end: segEnd });

    for (const seg of segments) {
      merged.push({
        id: `auto-holiday-${seg.start}-${h.title}`,
        store_id: 'auto',
        start_date: seg.start,
        end_date: seg.end,
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
  }

  return merged.sort((a, b) => a.start_date.localeCompare(b.start_date));
}

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const DOW_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 월~일 순 표기

export interface StorePeakWeekdays {
  peakDayIndices: number[];
  peakDayLabels: string[];
  peakLabelText: string;
  sampleDays: number;
  usedFallback: boolean;
  dowAverages: Array<{ dow: number; label: string; days: number; avgRevenue: number }>;
}

/**
 * 매장 최근 90일 매출 있는 날 기준 요일별 일평균 상위 2개 요일(매출 집중 요일) 산출
 * - 데이터 28일 미만이면 토·일 기본값
 */
export function computeStorePeakWeekdays(
  recentSalesRows: Array<{ date: string; net_revenue?: number | null }>
): StorePeakWeekdays {
  const buckets = Array.from({ length: 7 }, () => ({ sum: 0, days: 0 }));
  const validRows = recentSalesRows.filter((s) => (s.net_revenue ?? 0) > 0);

  for (const s of validRows) {
    const [y, m, d] = s.date.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    buckets[dow].sum += s.net_revenue ?? 0;
    buckets[dow].days += 1;
  }

  const dowAverages = DOW_DISPLAY_ORDER.map((dow) => ({
    dow,
    label: DOW_LABELS[dow],
    days: buckets[dow].days,
    avgRevenue: buckets[dow].days > 0 ? Math.round(buckets[dow].sum / buckets[dow].days) : 0,
  }));

  if (validRows.length < 28) {
    return {
      peakDayIndices: [6, 0],
      peakDayLabels: ['토', '일'],
      peakLabelText: '토·일',
      sampleDays: validRows.length,
      usedFallback: true,
      dowAverages,
    };
  }

  const ranked = [...dowAverages]
    .filter((d) => d.days > 0)
    .sort((a, b) => b.avgRevenue - a.avgRevenue)
    .slice(0, 2);

  const selectedIndices = ranked.length >= 2 ? ranked.map((r) => r.dow) : [6, 0];
  const orderedIndices = DOW_DISPLAY_ORDER.filter((d) => selectedIndices.includes(d));
  const labels = orderedIndices.map((d) => DOW_LABELS[d]);

  return {
    peakDayIndices: orderedIndices,
    peakDayLabels: labels,
    peakLabelText: labels.join('·'),
    sampleDays: validRows.length,
    usedFallback: false,
    dowAverages,
  };
}

export interface EventSegmentStats {
  days: number;
  peakDays: number;
  peakSharePct: number;
  totalRevenue: number;
  avgRevenue: number;
  avgPaymentCount: number | null;
}

export interface PerEventStat extends EventSegmentStats {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
}

export interface EventPeriodSalesComparison {
  hasManualEvents: boolean;
  hasAnyEvents: boolean;
  canCompare: boolean;
  peakLabelText: string;
  eventDays: number;
  normalDays: number;
  eventAvgRevenue: number;
  normalAvgRevenue: number;
  revenueDiffPct: number | null;
  eventAvgPaymentCount: number | null;
  normalAvgPaymentCount: number | null;
  eventSegment: EventSegmentStats;
  normalSegment: EventSegmentStats;
  holidaySegment: EventSegmentStats; // 자동 공휴일 구간
  perEventStats: PerEventStat[];
  hasWeekdaySkew: boolean;
  weekdaySkewMessage: string | null;
}

function calcSegmentStats(
  rows: Array<{
    date: string;
    net_revenue?: number | null;
    tables_used?: number | null;
    guest_count?: number | null;
  }>,
  peakDaySet: Set<number>
): EventSegmentStats {
  const days = rows.length;
  if (days === 0) {
    return {
      days: 0,
      peakDays: 0,
      peakSharePct: 0,
      totalRevenue: 0,
      avgRevenue: 0,
      avgPaymentCount: null,
    };
  }
  let totalRevenue = 0;
  let peakDays = 0;
  let paySum = 0;
  let payDays = 0;

  for (const r of rows) {
    totalRevenue += r.net_revenue ?? 0;
    const [y, m, d] = r.date.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (peakDaySet.has(dow)) peakDays += 1;
    const pay = getPaymentCount(r);
    if (pay !== null) {
      paySum += pay;
      payDays += 1;
    }
  }

  return {
    days,
    peakDays,
    peakSharePct: Number(((peakDays / days) * 100).toFixed(1)),
    totalRevenue,
    avgRevenue: Math.round(totalRevenue / days),
    avgPaymentCount: payDays > 0 ? Number((paySum / payDays).toFixed(1)) : null,
  };
}

/**
 * 사정 기간(사용자 기록 store_events) vs 그 외 평소(자동 공휴일 포함) 일평균 비교 (1-N2)
 * - 자동 공휴일은 사정 기간 판정에서 제외해 "그 외(평소)"에 포함하되 별도 holidaySegment 로도 산출
 * - 사용자 기록 holiday 는 사정 기간에 포함
 * - 매출이 있는 날만 계산, 한쪽이 0일이면 canCompare=false ("비교 불가")
 */
export function analyzeEventPeriodSales(
  salesRows: Array<{
    date: string;
    net_revenue?: number | null;
    tables_used?: number | null;
    guest_count?: number | null;
  }>,
  events: StoreEventRecord[],
  peakWeekdays?: StorePeakWeekdays
): EventPeriodSalesComparison {
  const validSales = salesRows.filter((s) => (s.net_revenue ?? 0) > 0);
  const peakIndices = peakWeekdays?.peakDayIndices ?? [6, 0];
  const peakLabelText = peakWeekdays?.peakLabelText ?? '토·일';
  const peakSet = new Set(peakIndices);

  const manualEvents = events.filter((e) => !e.isAutoHoliday);
  const autoHolidays = events.filter((e) => e.isAutoHoliday);

  const eventRows: typeof validSales = [];
  const normalRows: typeof validSales = [];
  const holidayRows: typeof validSales = [];

  for (const s of validSales) {
    const isManualEventDay = manualEvents.some(
      (ev) => ev.start_date <= s.date && s.date <= ev.end_date
    );
    if (isManualEventDay) {
      eventRows.push(s);
    } else {
      normalRows.push(s);
    }

    const isAutoHolidayDay = autoHolidays.some(
      (ev) => ev.start_date <= s.date && s.date <= ev.end_date
    );
    if (isAutoHolidayDay) {
      holidayRows.push(s);
    }
  }

  const eventSegment = calcSegmentStats(eventRows, peakSet);
  const normalSegment = calcSegmentStats(normalRows, peakSet);
  const holidaySegment = calcSegmentStats(holidayRows, peakSet);

  const perEventStats: PerEventStat[] = manualEvents.map((ev) => {
    const rows = validSales.filter((s) => ev.start_date <= s.date && s.date <= ev.end_date);
    return {
      id: ev.id,
      title: ev.title,
      start_date: ev.start_date,
      end_date: ev.end_date,
      ...calcSegmentStats(rows, peakSet),
    };
  });

  const canCompare = manualEvents.length > 0 && eventSegment.days > 0 && normalSegment.days > 0;
  const revenueDiffPct =
    canCompare && normalSegment.avgRevenue > 0
      ? Number(
          (((eventSegment.avgRevenue - normalSegment.avgRevenue) / normalSegment.avgRevenue) * 100).toFixed(1)
        )
      : null;

  const hasWeekdaySkew =
    canCompare && Math.abs(eventSegment.peakSharePct - normalSegment.peakSharePct) >= 15;

  return {
    hasManualEvents: manualEvents.length > 0,
    hasAnyEvents: events.length > 0,
    canCompare,
    peakLabelText,
    eventDays: eventSegment.days,
    normalDays: normalSegment.days,
    eventAvgRevenue: eventSegment.avgRevenue,
    normalAvgRevenue: normalSegment.avgRevenue,
    revenueDiffPct,
    eventAvgPaymentCount: eventSegment.avgPaymentCount,
    normalAvgPaymentCount: normalSegment.avgPaymentCount,
    eventSegment,
    normalSegment,
    holidaySegment,
    perEventStats,
    hasWeekdaySkew,
    weekdaySkewMessage: hasWeekdaySkew ? '요일 구성이 달라 단순 비교에 한계' : null,
  };
}

const LUNAR_HOLIDAY_FAMILIES = [
  { key: '설날', pattern: /(설날|설 연휴|설연휴)/ },
  { key: '추석', pattern: /추석/ },
  { key: '부처님오신날', pattern: /(부처님|석가탄신)/ },
] as const;

/**
 * 이번 달 또는 다음 달의 음력 명절(설날·추석·부처님오신날)과 같은 이름의
 * 작년 사용자 기록(type='holiday')을 찾아 반환 (AI 프롬프트 참고용)
 */
export function findLastYearSameLunarHolidays(
  targetEvents: StoreEventRecord[],
  allManualEvents: StoreEventRecord[],
  targetYear: number
): StoreEventRecord[] {
  const matchedFamilies = new Set<string>();
  for (const ev of targetEvents) {
    if (ev.type !== 'holiday') continue;
    for (const fam of LUNAR_HOLIDAY_FAMILIES) {
      if (fam.pattern.test(ev.title)) matchedFamilies.add(fam.key);
    }
  }
  if (matchedFamilies.size === 0) return [];

  const prevYearStr = String(targetYear - 1);
  return allManualEvents.filter((ev) => {
    if (ev.type !== 'holiday' || ev.isAutoHoliday) return false;
    if (!ev.start_date.startsWith(prevYearStr)) return false;
    return LUNAR_HOLIDAY_FAMILIES.some(
      (fam) => matchedFamilies.has(fam.key) && fam.pattern.test(ev.title)
    );
  });
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
