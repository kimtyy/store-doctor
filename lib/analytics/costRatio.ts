export function calculateCostRatio(totalRevenue: number, totalCost: number): number {
  if (totalRevenue <= 0) return 0;
  return (totalCost / totalRevenue) * 100;
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
