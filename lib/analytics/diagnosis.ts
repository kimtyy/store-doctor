import { detectGoldenCross, detectDeathCross } from './movingAverage';

export type DiagnosisStatus = 'growth' | 'caution' | 'danger' | 'stable';

export interface DiagnosisResult {
  status: DiagnosisStatus;
  title: string;
  description: string;
  alerts: string[];
}

export function diagnoseDailySales(
  todayRevenue: number,
  ma5: (number | null)[],
  ma20: (number | null)[],
  costRatio: number,
  costRatioMA5: (number | null)[]
): DiagnosisResult {
  const alerts: string[] = [];
  let status: DiagnosisStatus = 'stable';

  // 골든크로스 감지
  if (detectGoldenCross(ma5, ma20)) {
    status = 'growth';
    alerts.push('📈 5일선이 20일선을 돌파했습니다. 성장세를 보이고 있습니다.');
  }

  // 데스크로스 감지
  if (detectDeathCross(ma5, ma20)) {
    status = 'danger';
    alerts.push('📉 5일선이 20일선 아래로 내려갔습니다. 하락세에 주의하세요.');
  }

  // 원가율 분석
  if (costRatio > 50) {
    if (status === 'stable') status = 'danger';
    alerts.push(`⚠️  원가율이 ${costRatio.toFixed(1)}%로 높습니다. 식자재 비용을 점검하세요.`);
  } else if (costRatio > 40) {
    if (status !== 'growth' && status !== 'danger') status = 'caution';
    alerts.push(`💡 원가율이 ${costRatio.toFixed(1)}%입니다. 모니터링이 필요합니다.`);
  }

  // 원가율 상승 추세
  if (costRatioMA5.length >= 2) {
    const last = costRatioMA5[costRatioMA5.length - 1];
    const prev = costRatioMA5[costRatioMA5.length - 2];
    if (last !== null && prev !== null && last > prev + 2) {
      if (status === 'stable') status = 'caution';
      alerts.push(`🔴 원가율이 3일 연속 상승했습니다. 발주를 점검하세요.`);
    }
  }

  let title = '';
  let description = '';

  switch (status) {
    case 'growth':
      title = '⚡ 성장 중';
      description = '매출이 상승하고 있습니다. 좋은 추세입니다.';
      break;
    case 'caution':
      title = '⚠️  주의';
      description = '원가율이나 매출에 주의가 필요합니다.';
      break;
    case 'danger':
      title = '🚨 위험';
      description = '매출 하락 또는 원가율 상승. 즉시 점검이 필요합니다.';
      break;
    case 'stable':
      title = '✅ 안정적';
      description = '현재 상태가 안정적입니다.';
      break;
  }

  return {
    status,
    title,
    description,
    alerts,
  };
}
