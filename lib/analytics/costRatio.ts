/**
 * 재료비 기준 원가율 경고/참고 기준 상수 (조정 가능)
 */
export const COST_RATIO_THRESHOLDS = {
  /** 외식업 일반 재료비 원가율 참고선 (%) */
  INDUSTRY_REFERENCE_PCT: 35,
  /** 상대 기준 경고를 적용하기 위한 최소 영업일 수 (60일 데이터 충분 기준) */
  MIN_DAYS_FOR_RELATIVE_ALERT: 30,
  /** 주의: 5일 평균 원가율이 매장 60일 평균 대비 +3%p 이상 */
  RELATIVE_CAUTION_DELTA_PP: 3,
  /** 위험: 5일 평균 원가율이 매장 60일 평균 대비 +5%p 이상 */
  RELATIVE_DANGER_DELTA_PP: 5,
} as const;

export type CostRatioRelativeLevel = 'insufficient' | 'normal' | 'caution' | 'danger';

export function calculateCostRatio(totalRevenue: number, ingredientCost: number): number {
  if (totalRevenue <= 0) return 0;
  return (ingredientCost / totalRevenue) * 100;
}

export function costRatioStatus(ratio: number): 'excellent' | 'good' | 'warning' | 'critical' {
  if (ratio < 30) return 'excellent';
  if (ratio < 40) return 'good';
  if (ratio < 50) return 'warning';
  return 'critical';
}

export function costRatioLabel(ratio: number): string {
  const status = costRatioStatus(ratio);
  switch (status) {
    case 'excellent':
      return '매우 좋음';
    case 'good':
      return '좋음';
    case 'warning':
      return '주의';
    case 'critical':
      return '위험';
  }
}

export function evaluateCostRatioRelativeAlert(
  ma5: number | null,
  ma60: number | null,
  operatingDaysCount: number
): { level: CostRatioRelativeLevel; deltaPp: number | null } {
  if (
    operatingDaysCount < COST_RATIO_THRESHOLDS.MIN_DAYS_FOR_RELATIVE_ALERT ||
    ma5 === null ||
    ma60 === null
  ) {
    return { level: 'insufficient', deltaPp: null };
  }

  const deltaPp = ma5 - ma60;
  if (deltaPp >= COST_RATIO_THRESHOLDS.RELATIVE_DANGER_DELTA_PP) {
    return { level: 'danger', deltaPp };
  }
  if (deltaPp >= COST_RATIO_THRESHOLDS.RELATIVE_CAUTION_DELTA_PP) {
    return { level: 'caution', deltaPp };
  }
  return { level: 'normal', deltaPp };
}
