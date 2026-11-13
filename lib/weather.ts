/**
 * 날씨 코드 (WMO Weather interpretation codes) 해석 및 도우미 함수
 */

export interface WeatherInfo {
  code: number;
  emoji: string;
  text: string;
  temp: number;
  eveningTemp?: number;
  tomorrowMeanTemp?: number | null;
  comment: string;
}

export function getWeatherInfo(
  code: number,
  temp: number,
  eveningTemp?: number,
  tomorrowMeanTemp?: number | null
): WeatherInfo {
  let emoji = '⛈';
  let text = '천둥번개';
  let comment = '악천후 — 매출에 영향이 있을 수 있어요';

  if (code === 0) {
    emoji = '☀️';
    text = '맑음';
    comment = '맑은 날씨 — 야외 활동이 늘어나는 시간대를 노려보세요';
  } else if (code <= 2) {
    emoji = '🌤';
    text = '구름 조금';
    comment = '대체로 맑아 좋은 영업 날씨예요';
  } else if (code === 3) {
    emoji = '☁️';
    text = '흐림';
    comment = '흐린 날씨 — 평소와 비슷한 매출이 예상됩니다';
  } else if (code <= 48) {
    emoji = '🌫';
    text = '안개';
    comment = '안개 — 이른 시간 손님이 줄 수 있어요';
  } else if (code <= 55) {
    emoji = '🌦';
    text = '이슬비';
    comment = '이슬비 — 포장·배달 수요가 늘 수 있어요';
  } else if (code <= 65) {
    emoji = '🌧';
    text = '비';
    comment = '비 — 포장·배달 위주로 준비하세요';
  } else if (code <= 75) {
    emoji = '❄️';
    text = '눈';
    comment = '눈 — 도로 상황에 따라 방문이 줄 수 있어요';
  } else if (code <= 82) {
    emoji = '🌦';
    text = '소나기';
    comment = '소나기 예보 — 우산 준비를 권장해요';
  }

  return {
    code,
    emoji,
    text,
    temp,
    eveningTemp,
    tomorrowMeanTemp,
    comment,
  };
}

/**
 * daily_sales 저장을 위한 날씨 상태 문자열 변환 ('맑음' | '흐림' | '비' | '눈')
 */
export function codeToWeatherCondition(code: number): string {
  if (code <= 2) return '맑음';
  if (code === 3 || code <= 48) return '흐림';
  if (code <= 67 || (code >= 80 && code <= 82) || code >= 95) return '비';
  if (code <= 77 || code === 85 || code === 86) return '눈';
  return '흐림';
}

