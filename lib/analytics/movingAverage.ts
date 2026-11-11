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
