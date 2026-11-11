export function calculateMovingAverage(data: number[], period: number): (number | null)[] {
  if (period <= 0 || data.length === 0) {
    return [];
  }

  return data.map((_, index) => {
    if (index < period - 1) {
      return null;
    }
    const slice = data.slice(index - period + 1, index + 1);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / period;
  });
}

export type CrossSignal = 'golden' | 'death' | null;

/**
 * 전체 기간의 5일선/20일선(단기/장기) 교차 시점을 계산합니다.
 */
export function detectCrosses<T>(
  data: T[],
  ma5Key: keyof T,
  ma20Key: keyof T
): CrossSignal[] {
  return data.map((point, i) => {
    if (i === 0) return null;
    const prev = data[i - 1];
    const cur5 = point[ma5Key] as unknown as number | null;
    const prev5 = prev[ma5Key] as unknown as number | null;
    const cur20 = point[ma20Key] as unknown as number | null;
    const prev20 = prev[ma20Key] as unknown as number | null;
    if (cur5 == null || prev5 == null || cur20 == null || prev20 == null) return null;
    if (prev5 <= prev20 && cur5 > cur20) return 'golden';
    if (prev5 >= prev20 && cur5 < cur20) return 'death';
    return null;
  });
}

/**
 * 마지막 두 시점만 비교해 오늘 발생한 골든/데스크로스 여부를 반환합니다.
 * (향후 매출 골든크로스 발주 알림 등에 활용)
 */
export function detectTodayCross(
  shortSeries: (number | null)[],
  longSeries: (number | null)[]
): CrossSignal {
  const len = Math.min(shortSeries.length, longSeries.length);
  if (len < 2) return null;

  const prevShort = shortSeries[len - 2];
  const prevLong = longSeries[len - 2];
  const curShort = shortSeries[len - 1];
  const curLong = longSeries[len - 1];

  if (prevShort == null || prevLong == null || curShort == null || curLong == null) {
    return null;
  }

  if (prevShort <= prevLong && curShort > curLong) return 'golden';
  if (prevShort >= prevLong && curShort < curLong) return 'death';
  return null;
}
