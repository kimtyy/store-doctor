/**
 * OKPOS 파일 및 연·월 유틸리티 (클라이언트/서버 공용)
 */

/**
 * 파일명에서 연·월(YYYY-MM) 자동 추출
 */
export function detectYearMonthFromFileName(fileName: string): string | null {
  // Pattern 1: YYYY-MM or YYYY_MM or YYYY.MM
  const p1 = /(?:^|[^\d])(20\d{2})[-_.](\d{1,2})(?:[^\d]|$)/.exec(fileName);
  if (p1) {
    const y = p1[1];
    const m = String(Number(p1[2])).padStart(2, '0');
    if (Number(m) >= 1 && Number(m) <= 12) return `${y}-${m}`;
  }
  // Pattern 2: YYYY년 M월 or YYYY년M월
  const p2 = /(?:^|[^\d])(20\d{2})\s*년\s*(\d{1,2})\s*월/.exec(fileName);
  if (p2) {
    const y = p2[1];
    const m = String(Number(p2[2])).padStart(2, '0');
    if (Number(m) >= 1 && Number(m) <= 12) return `${y}-${m}`;
  }
  // Pattern 3: YYYYMM (예: 202401)
  const p3 = /(?:^|[^\d])(20\d{2})(\d{2})(?:[^\d]|$)/.exec(fileName);
  if (p3) {
    const y = p3[1];
    const m = p3[2];
    if (Number(m) >= 1 && Number(m) <= 12) return `${y}-${m}`;
  }
  return null;
}

/**
 * 다음 연·월(YYYY-MM) 계산
 */
export function getNextYearMonth(ym: string): string {
  const [yStr, mStr] = ym.split('-');
  let y = Number(yStr);
  let m = Number(mStr) + 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * 오늘 날짜 (Asia/Seoul YYYY-MM-DD)
 */
export function getSeoulTodayStr(): string {
  const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, '0');
  const d = String(kst.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 한국 시간(Asia/Seoul) 당일 00:00:00 에 해당하는 UTC ISO 문자열
 */
export function getSeoulStartOfDayUtc(date: Date = new Date()): string {
  const kstFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const kstDateStr = kstFormatter.format(date);
  return new Date(`${kstDateStr}T00:00:00+09:00`).toISOString();
}

