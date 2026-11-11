/**
 * 재료비 기준 원가율 경고/참고/이동평균 기준 상수 (조정 가능)
 */
export const COST_RATIO_THRESHOLDS = {
  /** 외식업 일반 재료비 원가율 참고선 (%) */
  INDUSTRY_REFERENCE_PCT: 35,
  /** 상대 기준 경고를 적용하기 위한 최소 영업일 수 (60일 데이터 충분 기준) */
  MIN_DAYS_FOR_RELATIVE_ALERT: 30,
  /** 주의: 20일 원가율이 매장 60일 원가율 대비 +3%p 이상 */
  RELATIVE_CAUTION_DELTA_PP: 3,
  /** 위험: 20일 원가율이 매장 60일 원가율 대비 +5%p 이상 */
  RELATIVE_DANGER_DELTA_PP: 5,
} as const;

/**
 * 이동평균 창(N일) 안에 필요한 최소 매출 입력일 수.
 * 미만이면 해당 날짜 원가율 이동평균을 null로 처리한다.
 */
export const COST_RATIO_MA_MIN_SALES_DAYS: Record<number, number> = {
  5: 3,
  20: 10,
  60: 30,
  120: 60,
};

export function getCostRatioMinSalesDays(period: number): number {
  return COST_RATIO_MA_MIN_SALES_DAYS[period] ?? Math.ceil(period / 2);
}

export type CostRatioRelativeLevel = 'insufficient' | 'normal' | 'caution' | 'danger';

export interface DailyCostRatioInput {
  date?: string; // YYYY-MM-DD (없으면 연속 일자 배열로 취급)
  revenue: number;
  ingredientCost: number;
}

function shiftDateStr(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate()
  ).padStart(2, '0')}`;
}

/**
 * N일 원가율 이동평균 시리즈 계산 (단일 공통 함수):
 * - N일 원가율 = (달력 창 안의 전체 재료비 합계[휴무·미입력일 매입 포함]) ÷ (창 안의 매출 있는 날 합계) × 100
 * - 매출 없는 날(revenue <= 0)은 분모(매출)·입력일수에서는 제외하되, 해당 창 내 재료비는 분자에 포함
 * - 재료비 매입 없는 영업일은 ingredientCost = 0으로 포함
 * - 창 안의 매출 입력일 수가 최소 기준 미만이면 null
 */
export function calculateCostRatioMovingAverage(
  days: DailyCostRatioInput[],
  period: number
): (number | null)[] {
  if (period <= 0 || days.length === 0) return [];
  const minSalesDays = getCostRatioMinSalesDays(period);

  return days.map((current, idx) => {
    let windowDays: DailyCostRatioInput[];
    if (current.date) {
      const startDate = shiftDateStr(current.date, -(period - 1));
      windowDays = [];
      for (let j = idx; j >= 0; j--) {
        const d = days[j];
        if (!d.date || d.date < startDate) break;
        windowDays.push(d);
      }
    } else {
      windowDays = days.slice(Math.max(0, idx - period + 1), idx + 1);
    }

    let salesDaysCount = 0;
    let revSum = 0;
    let ingSum = 0;
    for (const d of windowDays) {
      ingSum += Math.max(0, d.ingredientCost || 0);
      if (d.revenue > 0) {
        salesDaysCount++;
        revSum += d.revenue;
      }
    }

    if (salesDaysCount < minSalesDays || revSum <= 0) {
      return null;
    }
    return (ingSum / revSum) * 100;
  });
}

/**
 * 기간(또는 최근 60일) 합계 기준 원가율과 매출 입력일 수 계산
 * (휴무일·미입력일 재료비도 분자에 포함)
 */
export function calculateWindowCostRatio(days: DailyCostRatioInput[]): {
  costRatio: number | null;
  operatingDaysCount: number;
} {
  let operatingDaysCount = 0;
  let revSum = 0;
  let ingSum = 0;
  for (const d of days) {
    ingSum += Math.max(0, d.ingredientCost || 0);
    if (d.revenue > 0) {
      operatingDaysCount++;
      revSum += d.revenue;
    }
  }
  if (operatingDaysCount === 0 || revSum <= 0) {
    return { costRatio: null, operatingDaysCount };
  }
  return {
    costRatio: (ingSum / revSum) * 100,
    operatingDaysCount,
  };
}

export function getLatestCostRatioBaseline60(days: DailyCostRatioInput[]): {
  costRatio: number | null;
  operatingDaysCount: number;
} {
  if (days.length === 0) return { costRatio: null, operatingDaysCount: 0 };
  const validAll = days.filter((d) => d.revenue > 0);
  if (validAll.length === 0) return { costRatio: null, operatingDaysCount: 0 };

  const lastValid = validAll[validAll.length - 1];
  let windowDays: DailyCostRatioInput[];
  if (lastValid.date) {
    const startDate = shiftDateStr(lastValid.date, -59);
    // 마지막 매출일 기준 60일 달력 창 내 모든 날짜(휴무일 재료비 포함) 포함
    windowDays = days.filter((d) => d.date && d.date >= startDate && d.date <= lastValid.date!);
  } else {
    windowDays = days.slice(-60);
  }

  let operatingDaysCount = 0;
  let revSum = 0;
  let ingSum = 0;
  for (const d of windowDays) {
    ingSum += Math.max(0, d.ingredientCost || 0);
    if (d.revenue > 0) {
      operatingDaysCount++;
      revSum += d.revenue;
    }
  }

  if (operatingDaysCount < COST_RATIO_THRESHOLDS.MIN_DAYS_FOR_RELATIVE_ALERT || revSum <= 0) {
    return { costRatio: null, operatingDaysCount };
  }

  return {
    costRatio: (ingSum / revSum) * 100,
    operatingDaysCount,
  };
}

export function calculateCostRatio(totalRevenue: number, ingredientCost: number): number {
  if (totalRevenue <= 0) return 0;
  return (ingredientCost / totalRevenue) * 100;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function evaluateCostRatioRelativeAlert(
  recentCostRatio: number | null,
  ma60: number | null,
  operatingDaysCount: number
): { level: CostRatioRelativeLevel; deltaPp: number | null } {
  if (
    operatingDaysCount < COST_RATIO_THRESHOLDS.MIN_DAYS_FOR_RELATIVE_ALERT ||
    recentCostRatio === null ||
    ma60 === null
  ) {
    return { level: 'insufficient', deltaPp: null };
  }

  // 화면에 표시되는 소수 첫째 자리 반올림 값 기준으로 비교해 "+3.0%p인데 안정" 모순 방지
  const deltaPp = round1(round1(recentCostRatio) - round1(ma60));
  if (deltaPp >= COST_RATIO_THRESHOLDS.RELATIVE_DANGER_DELTA_PP) {
    return { level: 'danger', deltaPp };
  }
  if (deltaPp >= COST_RATIO_THRESHOLDS.RELATIVE_CAUTION_DELTA_PP) {
    return { level: 'caution', deltaPp };
  }
  return { level: 'normal', deltaPp };
}

export function formatCostRatioAlertSummary(
  ma20: number | null,
  ma60: number | null,
  operatingDaysCount: number
): {
  level: CostRatioRelativeLevel;
  deltaPp: number | null;
  title: string;
  message: string;
} {
  if (operatingDaysCount < COST_RATIO_THRESHOLDS.MIN_DAYS_FOR_RELATIVE_ALERT) {
    return {
      level: 'insufficient',
      deltaPp: null,
      title: '원가율 경고 준비 중',
      message: `데이터가 쌓이면 경고가 시작됩니다. (최근 60일 매출 입력 ${operatingDaysCount}일 / ${COST_RATIO_THRESHOLDS.MIN_DAYS_FOR_RELATIVE_ALERT}일 이상 시 활성화)`,
    };
  }
  const { level, deltaPp } = evaluateCostRatioRelativeAlert(ma20, ma60, operatingDaysCount);
  if (level === 'insufficient' || ma20 === null || ma60 === null || deltaPp === null) {
    return {
      level: 'insufficient',
      deltaPp: null,
      title: '원가율 계산 대기',
      message: '최근 20일간 매출 입력일이 10일 미만이어서 20일 원가율을 계산하지 않았습니다.',
    };
  }
  const r20 = round1(ma20);
  const r60 = round1(ma60);
  if (level === 'danger') {
    return {
      level,
      deltaPp,
      title: '원가율 위험',
      message: `최근 20일 원가율 ${r20.toFixed(1)}%로 평소(60일 ${r60.toFixed(1)}%)보다 ${deltaPp.toFixed(1)}%p 높습니다. 재료 단가나 로스를 즉시 확인해 보세요.`,
    };
  }
  if (level === 'caution') {
    return {
      level,
      deltaPp,
      title: '원가율 주의',
      message: `최근 20일 원가율 ${r20.toFixed(1)}%로 평소(60일 ${r60.toFixed(1)}%)보다 ${deltaPp.toFixed(1)}%p 높습니다. 재료 단가나 로스를 확인해 보세요.`,
    };
  }
  const diffText =
    deltaPp >= 0 ? `${deltaPp.toFixed(1)}%p 높지만 안정 범위입니다` : `${Math.abs(deltaPp).toFixed(1)}%p 낮아 안정적입니다`;
  return {
    level: 'normal',
    deltaPp,
    title: '원가율 안정',
    message: `최근 20일 원가율 ${r20.toFixed(1)}%로 평소(60일 ${r60.toFixed(1)}%)보다 ${diffText}.`,
  };
}
