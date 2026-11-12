/**
 * 대한민국 공휴일·명절·선거일·임시공휴일 정적 정의 (2024~2028)
 * - 외부 API 없이 연도별 실제 날짜(start_date ~ end_date) 정의
 * - 자동 공휴일은 항상 type='holiday', impact='unknown' (상권별 영향 방향 단정 방지)
 * - 2029년 이후: 양력 고정일만 자동 생성 (음력 명절·선거일은 추후 추가 필요)
 */

export type HolidayKind = 'fixed' | 'lunar' | 'substitute' | 'temporary' | 'election';

export interface HolidayDefinition {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  title: string;
  kind: HolidayKind;
}

const FIXED_SOLAR_HOLIDAYS: Array<{ mmdd: string; title: string }> = [
  { mmdd: '01-01', title: '신정' },
  { mmdd: '03-01', title: '삼일절' },
  { mmdd: '05-01', title: '노동절' },
  { mmdd: '05-05', title: '어린이날' },
  { mmdd: '06-06', title: '현충일' }, // 현충일은 대체공휴일 대상 아님
  { mmdd: '07-17', title: '제헌절' },
  { mmdd: '08-15', title: '광복절' },
  { mmdd: '10-03', title: '개천절' },
  { mmdd: '10-09', title: '한글날' },
  { mmdd: '12-25', title: '성탄절' },
];

export const HOLIDAYS_BY_YEAR: Record<number, HolidayDefinition[]> = {
  2024: [
    { startDate: '2024-01-01', endDate: '2024-01-01', title: '신정', kind: 'fixed' },
    { startDate: '2024-02-09', endDate: '2024-02-11', title: '설날 연휴', kind: 'lunar' },
    { startDate: '2024-02-12', endDate: '2024-02-12', title: '설날 대체공휴일', kind: 'substitute' },
    { startDate: '2024-03-01', endDate: '2024-03-01', title: '삼일절', kind: 'fixed' },
    { startDate: '2024-04-10', endDate: '2024-04-10', title: '제22대 국회의원선거', kind: 'election' },
    { startDate: '2024-05-05', endDate: '2024-05-05', title: '어린이날', kind: 'fixed' },
    { startDate: '2024-05-06', endDate: '2024-05-06', title: '어린이날 대체공휴일', kind: 'substitute' },
    { startDate: '2024-05-15', endDate: '2024-05-15', title: '부처님오신날', kind: 'lunar' },
    { startDate: '2024-06-06', endDate: '2024-06-06', title: '현충일', kind: 'fixed' },
    { startDate: '2024-08-15', endDate: '2024-08-15', title: '광복절', kind: 'fixed' },
    { startDate: '2024-09-16', endDate: '2024-09-18', title: '추석 연휴', kind: 'lunar' },
    { startDate: '2024-10-01', endDate: '2024-10-01', title: '국군의날 임시공휴일', kind: 'temporary' },
    { startDate: '2024-10-03', endDate: '2024-10-03', title: '개천절', kind: 'fixed' },
    { startDate: '2024-10-09', endDate: '2024-10-09', title: '한글날', kind: 'fixed' },
    { startDate: '2024-12-25', endDate: '2024-12-25', title: '성탄절', kind: 'fixed' },
  ],
  2025: [
    { startDate: '2025-01-01', endDate: '2025-01-01', title: '신정', kind: 'fixed' },
    { startDate: '2025-01-27', endDate: '2025-01-27', title: '임시공휴일(설 연휴)', kind: 'temporary' },
    { startDate: '2025-01-28', endDate: '2025-01-30', title: '설날 연휴', kind: 'lunar' },
    { startDate: '2025-03-01', endDate: '2025-03-01', title: '삼일절', kind: 'fixed' },
    { startDate: '2025-03-03', endDate: '2025-03-03', title: '삼일절 대체공휴일', kind: 'substitute' },
    { startDate: '2025-05-05', endDate: '2025-05-05', title: '어린이날·부처님오신날', kind: 'lunar' },
    { startDate: '2025-05-06', endDate: '2025-05-06', title: '어린이날·부처님오신날 대체공휴일', kind: 'substitute' },
    { startDate: '2025-06-03', endDate: '2025-06-03', title: '제21대 대통령선거', kind: 'election' },
    { startDate: '2025-06-06', endDate: '2025-06-06', title: '현충일', kind: 'fixed' },
    { startDate: '2025-08-15', endDate: '2025-08-15', title: '광복절', kind: 'fixed' },
    { startDate: '2025-10-03', endDate: '2025-10-03', title: '개천절', kind: 'fixed' },
    { startDate: '2025-10-05', endDate: '2025-10-07', title: '추석 연휴', kind: 'lunar' },
    { startDate: '2025-10-08', endDate: '2025-10-08', title: '추석 대체공휴일', kind: 'substitute' },
    { startDate: '2025-10-09', endDate: '2025-10-09', title: '한글날', kind: 'fixed' },
    { startDate: '2025-12-25', endDate: '2025-12-25', title: '성탄절', kind: 'fixed' },
  ],
  2026: [
    { startDate: '2026-01-01', endDate: '2026-01-01', title: '신정', kind: 'fixed' },
    { startDate: '2026-02-16', endDate: '2026-02-18', title: '설날 연휴', kind: 'lunar' },
    { startDate: '2026-03-01', endDate: '2026-03-01', title: '삼일절', kind: 'fixed' },
    { startDate: '2026-03-02', endDate: '2026-03-02', title: '삼일절 대체공휴일', kind: 'substitute' },
    { startDate: '2026-05-01', endDate: '2026-05-01', title: '노동절', kind: 'fixed' },
    { startDate: '2026-05-05', endDate: '2026-05-05', title: '어린이날', kind: 'fixed' },
    { startDate: '2026-05-24', endDate: '2026-05-24', title: '부처님오신날', kind: 'lunar' },
    { startDate: '2026-05-25', endDate: '2026-05-25', title: '부처님오신날 대체공휴일', kind: 'substitute' },
    { startDate: '2026-06-03', endDate: '2026-06-03', title: '제9회 전국동시지방선거', kind: 'election' },
    { startDate: '2026-06-06', endDate: '2026-06-06', title: '현충일', kind: 'fixed' },
    { startDate: '2026-07-17', endDate: '2026-07-17', title: '제헌절', kind: 'fixed' },
    { startDate: '2026-08-15', endDate: '2026-08-15', title: '광복절', kind: 'fixed' },
    { startDate: '2026-08-17', endDate: '2026-08-17', title: '광복절 대체공휴일', kind: 'substitute' },
    { startDate: '2026-09-24', endDate: '2026-09-26', title: '추석 연휴', kind: 'lunar' },
    { startDate: '2026-10-03', endDate: '2026-10-03', title: '개천절', kind: 'fixed' },
    { startDate: '2026-10-05', endDate: '2026-10-05', title: '개천절 대체공휴일', kind: 'substitute' },
    { startDate: '2026-10-09', endDate: '2026-10-09', title: '한글날', kind: 'fixed' },
    { startDate: '2026-12-25', endDate: '2026-12-25', title: '성탄절', kind: 'fixed' },
  ],
  2027: [
    { startDate: '2027-01-01', endDate: '2027-01-01', title: '신정', kind: 'fixed' },
    { startDate: '2027-02-06', endDate: '2027-02-08', title: '설날 연휴', kind: 'lunar' },
    { startDate: '2027-02-09', endDate: '2027-02-09', title: '설날 대체공휴일', kind: 'substitute' },
    { startDate: '2027-03-01', endDate: '2027-03-01', title: '삼일절', kind: 'fixed' },
    { startDate: '2027-05-01', endDate: '2027-05-01', title: '노동절', kind: 'fixed' },
    { startDate: '2027-05-03', endDate: '2027-05-03', title: '노동절 대체공휴일', kind: 'substitute' },
    { startDate: '2027-05-05', endDate: '2027-05-05', title: '어린이날', kind: 'fixed' },
    { startDate: '2027-05-13', endDate: '2027-05-13', title: '부처님오신날', kind: 'lunar' },
    { startDate: '2027-06-06', endDate: '2027-06-06', title: '현충일', kind: 'fixed' },
    { startDate: '2027-07-17', endDate: '2027-07-17', title: '제헌절', kind: 'fixed' },
    { startDate: '2027-07-19', endDate: '2027-07-19', title: '제헌절 대체공휴일', kind: 'substitute' },
    { startDate: '2027-08-15', endDate: '2027-08-15', title: '광복절', kind: 'fixed' },
    { startDate: '2027-08-16', endDate: '2027-08-16', title: '광복절 대체공휴일', kind: 'substitute' },
    { startDate: '2027-09-14', endDate: '2027-09-16', title: '추석 연휴', kind: 'lunar' },
    { startDate: '2027-10-03', endDate: '2027-10-03', title: '개천절', kind: 'fixed' },
    { startDate: '2027-10-04', endDate: '2027-10-04', title: '개천절 대체공휴일', kind: 'substitute' },
    { startDate: '2027-10-09', endDate: '2027-10-09', title: '한글날', kind: 'fixed' },
    { startDate: '2027-10-11', endDate: '2027-10-11', title: '한글날 대체공휴일', kind: 'substitute' },
    { startDate: '2027-12-25', endDate: '2027-12-25', title: '성탄절', kind: 'fixed' },
    { startDate: '2027-12-27', endDate: '2027-12-27', title: '성탄절 대체공휴일', kind: 'substitute' },
  ],
  2028: [
    { startDate: '2028-01-01', endDate: '2028-01-01', title: '신정', kind: 'fixed' },
    { startDate: '2028-01-26', endDate: '2028-01-28', title: '설날 연휴', kind: 'lunar' },
    { startDate: '2028-03-01', endDate: '2028-03-01', title: '삼일절', kind: 'fixed' },
    { startDate: '2028-04-12', endDate: '2028-04-12', title: '제23대 국회의원선거', kind: 'election' },
    { startDate: '2028-05-01', endDate: '2028-05-01', title: '노동절', kind: 'fixed' },
    { startDate: '2028-05-02', endDate: '2028-05-02', title: '부처님오신날', kind: 'lunar' },
    { startDate: '2028-05-05', endDate: '2028-05-05', title: '어린이날', kind: 'fixed' },
    { startDate: '2028-06-06', endDate: '2028-06-06', title: '현충일', kind: 'fixed' },
    { startDate: '2028-07-17', endDate: '2028-07-17', title: '제헌절', kind: 'fixed' },
    { startDate: '2028-08-15', endDate: '2028-08-15', title: '광복절', kind: 'fixed' },
    { startDate: '2028-10-02', endDate: '2028-10-04', title: '추석 연휴', kind: 'lunar' },
    { startDate: '2028-10-05', endDate: '2028-10-05', title: '개천절·추석 대체공휴일', kind: 'substitute' },
    { startDate: '2028-10-09', endDate: '2028-10-09', title: '한글날', kind: 'fixed' },
    { startDate: '2028-12-25', endDate: '2028-12-25', title: '성탄절', kind: 'fixed' },
  ],
};

const warnedMissingYears = new Set<number>();

export function getHolidaysForYear(year: number): HolidayDefinition[] {
  if (HOLIDAYS_BY_YEAR[year]) {
    return HOLIDAYS_BY_YEAR[year];
  }
  // TODO: 2029년 이후 음력 명절(설날·추석·부처님오신날)·선거일·대체공휴일 추가 필요
  if (year >= 2029 && !warnedMissingYears.has(year)) {
    warnedMissingYears.add(year);
    console.warn(`[holidays] ${year}년 음력 명절·선거일 정의가 없어 양력 고정 공휴일만 표시합니다.`);
  }
  return FIXED_SOLAR_HOLIDAYS.map((h) => {
    const d = `${year}-${h.mmdd}`;
    return { startDate: d, endDate: d, title: h.title, kind: 'fixed' as const };
  });
}

export function getHolidaysInRange(fromDate: string, toDate: string): HolidayDefinition[] {
  const startYear = parseInt(fromDate.slice(0, 4), 10);
  const endYear = parseInt(toDate.slice(0, 4), 10);
  if (isNaN(startYear) || isNaN(endYear)) return [];

  const results: HolidayDefinition[] = [];
  for (let y = startYear; y <= endYear; y++) {
    for (const h of getHolidaysForYear(y)) {
      if (h.endDate >= fromDate && h.startDate <= toDate) {
        results.push(h);
      }
    }
  }
  return results.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

