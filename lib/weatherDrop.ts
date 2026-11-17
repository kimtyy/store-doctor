import type { StoreSensitivityResult, SensitivityStage } from './tempDropSensitivity';

export interface DayWeatherAlert {
  date: string; // KST YYYY-MM-DD
  label: '오늘' | '내일' | '모레';
  dateDisplay: string; // e.g. '11.17'
  meanTemp: number | null;
  delta: number | null; // 전일 대비 하락폭 Δ (양수 = 기온 하락)
  hasDropAlert: boolean;
  dropMessage: string | null;
  dropStage: number | null; // 0, 1, 2
  sampleCount: number | null; // n_k
  dropAmount: number | null; // Δ(d)
  hasColdWave: boolean;
  eveningApparentTemp: number | null;
  coldWaveMessage: string | null;
}

export interface ThreeDayAlertsResult {
  hasAnyAlert: boolean; // 3일 중 하나라도 알림이 있으면 true, 전부 없으면 false (카드 숨김)
  kstToday: string;
  days: [DayWeatherAlert, DayWeatherAlert, DayWeatherAlert]; // 오늘, 내일, 모레
  recoveryNotice?: string; // 기온 급락 시 사흘째 회복 안내
}

/**
 * KST 기준 날짜 문자열 YYYY-MM-DD 반환
 */
export function getKstDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * KST 날짜 오프셋 계산 (daysToAdd 일 후의 YYYY-MM-DD)
 */
export function addKstDays(baseDateStr: string, daysToAdd: number): string {
  const [y, m, d] = baseDateStr.split('-').map((v) => parseInt(v, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + daysToAdd);
  return dt.toISOString().slice(0, 10);
}

/**
 * MM.DD 형식 날짜 포맷
 */
export function formatMonthDay(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length >= 3) {
    return `${parseInt(parts[1], 10)}.${parseInt(parts[2], 10)}`;
  }
  return dateStr;
}

/**
 * Open-Meteo 예보 응답을 바탕으로 오늘/내일/모레 3일 띠의 기온 급락 및 한파 알림 판정
 */
export function detectTempDropAlerts(
  forecastData: any,
  sensitivity: StoreSensitivityResult | null,
  nowDate: Date = new Date()
): ThreeDayAlertsResult {
  const todayStr = getKstDateString(nowDate);
  const tomorrowStr = addKstDays(todayStr, 1);
  const dayAfterTomorrowStr = addKstDays(todayStr, 2);

  const targetDays: Array<{ date: string; label: '오늘' | '내일' | '모레' }> = [
    { date: todayStr, label: '오늘' },
    { date: tomorrowStr, label: '내일' },
    { date: dayAfterTomorrowStr, label: '모레' },
  ];

  // 1. daily.time과 daily.temperature_2m_mean을 Map으로 인덱싱
  const tempMap = new Map<string, number>();
  const dailyTimes: string[] = forecastData?.daily?.time ?? [];
  const dailyTemps: (number | null)[] = forecastData?.daily?.temperature_2m_mean ?? [];

  for (let i = 0; i < dailyTimes.length; i++) {
    const t = dailyTimes[i];
    const temp = dailyTemps[i];
    if (temp !== null && temp !== undefined && !isNaN(temp)) {
      tempMap.set(t, temp);
    }
  }

  // 2. Δ(d) = 평균(d-1) - 평균(d) 계산 (항상 연속 두 날 비교)
  // 예보 응답 데이터 안의 값들끼리만 비교
  const deltaMap = new Map<string, number>();
  for (const [dateStr, meanTemp] of tempMap.entries()) {
    const prevDateStr = addKstDays(dateStr, -1);
    const prevTemp = tempMap.get(prevDateStr);
    if (prevTemp !== undefined) {
      const delta = Math.round((prevTemp - meanTemp) * 10) / 10;
      deltaMap.set(dateStr, delta);
    }
  }

  // 3. 저녁(19~23시 KST) 체감온도 계산
  const eveningApparentMap = new Map<string, number>();
  const hourlyTimes: string[] = forecastData?.hourly?.time ?? [];
  const hourlyApparent: (number | null)[] = forecastData?.hourly?.apparent_temperature ?? [];

  const eveningBuckets = new Map<string, number[]>();
  for (let i = 0; i < hourlyTimes.length; i++) {
    const ht = hourlyTimes[i];
    const appTemp = hourlyApparent[i];
    if (appTemp === null || appTemp === undefined || isNaN(appTemp)) continue;

    const datePart = ht.slice(0, 10);
    const hour = parseInt(ht.slice(11, 13), 10);
    if (hour >= 19 && hour <= 23) {
      if (!eveningBuckets.has(datePart)) {
        eveningBuckets.set(datePart, []);
      }
      eveningBuckets.get(datePart)!.push(appTemp);
    }
  }

  for (const [datePart, temps] of eveningBuckets.entries()) {
    if (temps.length > 0) {
      const avg = temps.reduce((a, b) => a + b, 0) / temps.length;
      eveningApparentMap.set(datePart, Math.round(avg * 10) / 10);
    }
  }

  // 4. 대상일 T (오늘, 내일, 모레)별 판정
  const results: DayWeatherAlert[] = targetDays.map(({ date: T, label }) => {
    const meanTemp = tempMap.get(T) ?? null;
    const deltaT = deltaMap.get(T) ?? null;

    // 한파 알림 판정: 저녁 체감 <= -10°C
    const eveningApp = eveningApparentMap.get(T) ?? null;
    let hasColdWave = false;
    let coldWaveMessage: string | null = null;
    if (eveningApp !== null && eveningApp <= -10.0) {
      hasColdWave = true;
      coldWaveMessage = `저녁 체감 ${eveningApp}°C 한파 주의`;
    }

    // 급락 판정 후보 수집
    // T 급락: 0단계 (dropDate = T)
    // T-1 급락: 1단계 (dropDate = T-1)
    // T-2 급락: 2단계 (dropDate = T-2, 12·1·2월이면 겨울 2단계)
    interface Candidate {
      stage: SensitivityStage;
      k: number;
      dropDate: string;
      dropAmount: number;
    }
    const candidates: Candidate[] = [];

    // k = 0: 당일(T) 급락
    const delta0 = deltaMap.get(T);
    if (delta0 !== undefined && delta0 >= 3.0) {
      const stage0 = sensitivity?.stages?.[0] ?? {
        k: 0,
        effect: 0,
        roundedPercent: 0,
        n: 0,
        hasSignificantEffect: true,
      };
      candidates.push({ stage: stage0, k: 0, dropDate: T, dropAmount: delta0 });
    }

    // k = 1: 어제(T-1) 급락
    const dateMinus1 = addKstDays(T, -1);
    const delta1 = deltaMap.get(dateMinus1);
    if (delta1 !== undefined && delta1 >= 3.0) {
      const stage1 = sensitivity?.stages?.[1] ?? {
        k: 1,
        effect: 0,
        roundedPercent: 0,
        n: 0,
        hasSignificantEffect: true,
      };
      candidates.push({ stage: stage1, k: 1, dropDate: dateMinus1, dropAmount: delta1 });
    }

    // k = 2: 그제(T-2) 급락
    const dateMinus2 = addKstDays(T, -2);
    const delta2 = deltaMap.get(dateMinus2);
    if (delta2 !== undefined && delta2 >= 3.0) {
      const month2 = parseInt(dateMinus2.slice(5, 7), 10);
      const isWinter = [12, 1, 2].includes(month2);
      const stage2 =
        isWinter && sensitivity?.winterStage2
          ? sensitivity.winterStage2
          : sensitivity?.stages?.[2] ?? {
              k: 2,
              effect: 0,
              roundedPercent: 0,
              n: 0,
              hasSignificantEffect: true,
            };
      candidates.push({ stage: stage2, k: 2, dropDate: dateMinus2, dropAmount: delta2 });
    }

    // 후보 중 여러 개면 가장 큰 감소(effect가 가장 작은 음수) 하나 선택
    let chosen: Candidate | null = null;
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.stage.effect - b.stage.effect);
      chosen = candidates[0];
    }

    // 단계 효과가 -5%보다 약하면(effect > -0.05) 영향 없음 처리
    let hasDropAlert = false;
    let dropMessage: string | null = null;
    let dropStage: number | null = null;
    let sampleCount: number | null = null;
    let dropAmount: number | null = null;

    if (chosen) {
      const isEligible = sensitivity?.isEligible ?? false;

      if (isEligible) {
        // 자격 충족 매장: 효과가 -5% 이하로 유의미할 때만 표시
        if (chosen.stage.effect <= -0.05) {
          hasDropAlert = true;
          dropStage = chosen.k;
          sampleCount = chosen.stage.n;
          dropAmount = chosen.dropAmount;
          const dropAmountStr = chosen.dropAmount.toFixed(1);
          const dropPercentAbs = Math.abs(chosen.stage.roundedPercent);

          if (label === '오늘') {
            const dropWhen = chosen.k === 1 ? '어제' : chosen.k === 0 ? '오늘' : '그제';
            dropMessage = `${dropWhen} ${dropAmountStr}°C 하락 — 오늘은 매출이 평소보다 약 ${dropPercentAbs}% 낮을 수 있어요 (지난 급락 ${sampleCount}번 평균)`;
          } else if (label === '내일') {
            const dropWhen = chosen.k === 1 ? '오늘' : chosen.k === 0 ? '내일' : '어제';
            const suffix = chosen.k === 0 ? ' 예상' : '';
            dropMessage = `${dropWhen} ${dropAmountStr}°C 하락${suffix} — 내일은 매출이 평소보다 약 ${dropPercentAbs}% 낮을 수 있어요 (지난 급락 ${sampleCount}번 평균)`;
          } else {
            // 모레
            const dropWhen = chosen.k === 1 ? '내일' : chosen.k === 0 ? '모레' : '오늘';
            const suffix = chosen.k <= 1 ? ' 예상' : '';
            dropMessage = `${dropWhen} ${dropAmountStr}°C 하락${suffix} — 모레는 매출이 평소보다 약 ${dropPercentAbs}% 낮을 수 있어요 (지난 급락 ${sampleCount}번 평균)`;
          }
        }
      } else {
        // 자격 미달 매장: 숫자 없이 사실만 알림
        hasDropAlert = true;
        dropStage = chosen.k;
        dropAmount = chosen.dropAmount;
        const dropAmountStr = chosen.dropAmount.toFixed(1);

        if (label === '오늘') {
          const dropWhen = chosen.k === 1 ? '어제' : chosen.k === 0 ? '오늘' : '그제';
          dropMessage = `${dropWhen} 기온이 많이 떨어졌어요 (${dropAmountStr}°C 하락)`;
        } else if (label === '내일') {
          const dropWhen = chosen.k === 1 ? '오늘' : '내일';
          const verb = chosen.k === 1 ? '많이 떨어졌어요' : '크게 떨어질 예정이에요';
          const suffix = chosen.k === 0 ? ' 예상' : '';
          dropMessage = `${dropWhen} 기온이 ${verb} (${dropAmountStr}°C 하락${suffix})`;
        } else {
          // 모레
          dropMessage = `모레 기온이 크게 떨어질 예정이에요 (${dropAmountStr}°C 하락 예상)`;
        }
      }
    }

    return {
      date: T,
      label,
      dateDisplay: formatMonthDay(T),
      meanTemp,
      delta: deltaT,
      hasDropAlert,
      dropMessage,
      dropStage,
      sampleCount,
      dropAmount,
      hasColdWave,
      eveningApparentTemp: eveningApp,
      coldWaveMessage,
    };
  });

  const hasAnyAlert = results.some((d) => d.hasDropAlert || d.hasColdWave);
  const hasAnyDropAlert = results.some((d) => d.hasDropAlert);

  return {
    hasAnyAlert,
    kstToday: todayStr,
    days: [results[0], results[1], results[2]],
    recoveryNotice: hasAnyDropAlert ? '기온 급락 영향은 보통 사흘째에 평소 수준으로 회복돼요.' : undefined,
  };
}
