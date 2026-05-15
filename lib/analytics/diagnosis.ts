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
  costRatioMA5Series: (number | null)[],
  costRatioMA20Series: (number | null)[],
): DiagnosisResult {
  void todayRevenue; // reserved for future use
  const alerts: string[] = [];
  let status: DiagnosisStatus = 'stable';

  // 매출 골든크로스 / 데스크로스
  if (detectGoldenCross(ma5, ma20)) {
    status = 'growth';
    alerts.push('📈 5일선이 20일선을 돌파했습니다. 성장세를 보이고 있습니다.');
  }
  if (detectDeathCross(ma5, ma20)) {
    status = 'danger';
    alerts.push('📉 5일선이 20일선 아래로 내려갔습니다. 하락세에 주의하세요.');
  }

  // 원가율 5일 이평선 기준 경고
  const latestCR5 = costRatioMA5Series.length > 0
    ? costRatioMA5Series[costRatioMA5Series.length - 1]
    : null;

  if (latestCR5 !== null) {
    if (latestCR5 > 70) {
      if (status !== 'growth') status = 'danger';
      alerts.push(`🚨 5일 평균 원가율 ${latestCR5.toFixed(1)}%로 위험 수준입니다. 즉시 점검하세요.`);
    } else if (latestCR5 >= 55) {
      if (status === 'stable') status = 'caution';
      alerts.push(`⚠️  5일 평균 원가율 ${latestCR5.toFixed(1)}%입니다. 주의가 필요합니다.`);
    }
  }

  // 원가율 5일선이 20일선 위로 올라가면 → 상승 추세
  if (costRatioMA5Series.length >= 2 && costRatioMA20Series.length >= 2) {
    const len5 = costRatioMA5Series.length;
    const len20 = costRatioMA20Series.length;
    const cur5 = costRatioMA5Series[len5 - 1];
    const prev5 = costRatioMA5Series[len5 - 2];
    const cur20 = costRatioMA20Series[len20 - 1];
    const prev20 = costRatioMA20Series[len20 - 2];
    if (cur5 !== null && prev5 !== null && cur20 !== null && prev20 !== null
      && prev5 <= prev20 && cur5 > cur20) {
      if (status === 'stable') status = 'caution';
      alerts.push('🔴 원가율 5일선이 20일선을 넘었습니다. 원가율 상승 추세에 주의하세요.');
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

  return { status, title, description, alerts };
}
