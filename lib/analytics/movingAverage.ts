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

export function detectGoldenCross(ma5: (number | null)[], ma20: (number | null)[]): boolean {
  const len = Math.min(ma5.length, ma20.length);
  if (len < 2) return false;

  const yesterday5 = ma5[len - 2];
  const yesterday20 = ma20[len - 2];
  const today5 = ma5[len - 1];
  const today20 = ma20[len - 1];

  if (yesterday5 === null || yesterday20 === null || today5 === null || today20 === null) {
    return false;
  }

  return yesterday5 <= yesterday20 && today5 > today20;
}

export function detectDeathCross(ma5: (number | null)[], ma20: (number | null)[]): boolean {
  const len = Math.min(ma5.length, ma20.length);
  if (len < 2) return false;

  const yesterday5 = ma5[len - 2];
  const yesterday20 = ma20[len - 2];
  const today5 = ma5[len - 1];
  const today20 = ma20[len - 1];

  if (yesterday5 === null || yesterday20 === null || today5 === null || today20 === null) {
    return false;
  }

  return yesterday5 >= yesterday20 && today5 < today20;
}
