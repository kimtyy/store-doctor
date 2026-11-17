import { SupabaseClient } from '@supabase/supabase-js';
import { fetchAll } from '@/lib/supabase/fetchAll';
import { codeToWeatherCondition } from '@/lib/weather';

export interface WeatherDayData {
  code: number;
  temp: number;
}

export interface WeatherBackfillResult {
  total: number;
  updated: number;
  failed: number;
  skipped: number;
}

/**
 * Open-Meteo Archive API 호출 (연 단위 또는 특정 기간)
 */
export async function fetchOpenMeteoArchive(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string
): Promise<Map<string, WeatherDayData>> {
  const map = new Map<string, WeatherDayData>();
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&daily=weather_code,temperature_2m_mean&timezone=Asia%2FSeoul`;

  let res: Response | null = null;
  let lastError: any = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const startTime = Date.now();
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });
      const durationMs = Date.now() - startTime;

      if (response.ok) {
        res = response;
        break;
      }

      console.warn(
        `[Open-Meteo Archive] 호출 실패 (시도 ${attempt}/2) - status: ${response.status}, duration: ${durationMs}ms`
      );

      // 4xx (429 제외)는 재시도 안 함
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        res = response;
        break;
      }

      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (err: any) {
      lastError = err;
      const durationMs = Date.now() - startTime;
      console.warn(
        `[Open-Meteo Archive] 예외 발생 (시도 ${attempt}/2) - ${err?.name || 'Error'}: ${err?.message}, duration: ${durationMs}ms`
      );
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  if (!res || !res.ok) {
    console.error(
      `[Open-Meteo Archive] 최종 실패 (${startDate}~${endDate}) - status: ${res?.status || 500}, lastError: ${lastError?.message}`
    );
    return map;
  }

  const data = await res.json();
  const times: string[] = data.daily?.time ?? [];
  const codes: (number | null)[] = data.daily?.weather_code ?? [];
  const temps: (number | null)[] = data.daily?.temperature_2m_mean ?? [];

  for (let i = 0; i < times.length; i++) {
    const d = times[i];
    const code = codes[i];
    const temp = temps[i];
    if (code !== null && code !== undefined && temp !== null && temp !== undefined && !isNaN(temp)) {
      map.set(d, { code, temp });
    }
  }

  return map;
}

/**
 * Open-Meteo Forecast API (최근 날짜 보정용 past_days=14)
 */
export async function fetchOpenMeteoForecast(
  lat: number,
  lon: number,
  pastDays: number = 14
): Promise<Map<string, WeatherDayData>> {
  const map = new Map<string, WeatherDayData>();
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_mean&timezone=Asia%2FSeoul&past_days=${pastDays}&forecast_days=1`;

  let res: Response | null = null;
  let lastError: any = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const startTime = Date.now();
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });
      const durationMs = Date.now() - startTime;

      if (response.ok) {
        res = response;
        break;
      }

      console.warn(
        `[Open-Meteo Forecast] 호출 실패 (시도 ${attempt}/2) - status: ${response.status}, duration: ${durationMs}ms`
      );

      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        res = response;
        break;
      }

      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (err: any) {
      lastError = err;
      const durationMs = Date.now() - startTime;
      console.warn(
        `[Open-Meteo Forecast] 예외 발생 (시도 ${attempt}/2) - ${err?.name || 'Error'}: ${err?.message}, duration: ${durationMs}ms`
      );
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  if (!res || !res.ok) {
    console.error(
      `[Open-Meteo Forecast] 최종 실패 - status: ${res?.status || 500}, lastError: ${lastError?.message}`
    );
    return map;
  }

  const data = await res.json();
  const times: string[] = data.daily?.time ?? [];
  const codes: (number | null)[] = data.daily?.weather_code ?? [];
  const temps: (number | null)[] = data.daily?.temperature_2m_mean ?? [];

  for (let i = 0; i < times.length; i++) {
    const d = times[i];
    const code = codes[i];
    const temp = temps[i];
    if (code !== null && code !== undefined && temp !== null && temp !== undefined && !isNaN(temp)) {
      map.set(d, { code, temp });
    }
  }

  return map;
}

/**
 * 대상 날짜 목록을 연 단위로 묶어 Open-Meteo Archive를 1회씩 호출하고,
 * 최근 14일 및 Archive 누락분은 Forecast API로 보정하여 전체 날짜별 날씨 Map 구성
 */
export async function collectWeatherMap(
  lat: number,
  lon: number,
  dates: string[]
): Promise<Map<string, WeatherDayData>> {
  const combinedMap = new Map<string, WeatherDayData>();
  if (dates.length === 0) return combinedMap;

  // 1. 연 단위로 날짜 그룹핑
  const yearGroups = new Map<string, string[]>();
  for (const d of dates) {
    const y = d.slice(0, 4);
    if (!yearGroups.has(y)) {
      yearGroups.set(y, []);
    }
    yearGroups.get(y)!.push(d);
  }

  // 2. 각 연도별 Archive API 호출
  const sortedYears = Array.from(yearGroups.keys()).sort();
  for (const year of sortedYears) {
    const yearDates = yearGroups.get(year)!.sort();
    const startDate = yearDates[0];
    const endDate = yearDates[yearDates.length - 1];

    console.log(`[Open-Meteo] ${year}년 Archive 조회 중: ${startDate} ~ ${endDate}`);
    const archiveMap = await fetchOpenMeteoArchive(lat, lon, startDate, endDate);
    for (const [d, val] of archiveMap.entries()) {
      combinedMap.set(d, val);
    }
  }

  // 3. 최근 14일 날짜가 포함되어 있거나 Archive에서 누락된 최근 날짜가 있는 경우 Forecast API로 보정
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const hasRecentDates = dates.some((d) => d >= fourteenDaysAgo);
  if (hasRecentDates) {
    console.log(`[Open-Meteo] 최근 날짜 보정을 위해 Forecast API 조회 중...`);
    const forecastMap = await fetchOpenMeteoForecast(lat, lon, 14);
    for (const [d, val] of forecastMap.entries()) {
      combinedMap.set(d, val);
    }
  }

  return combinedMap;
}

/**
 * daily_sales 행들에 날씨 정보를 200건씩 청크 업데이트
 */
export async function applyWeatherUpdates(
  supabase: SupabaseClient,
  storeId: string,
  rows: { id: string; date: string }[],
  weatherMap: Map<string, WeatherDayData>
): Promise<WeatherBackfillResult> {
  const toUpdate: { id: string; condition: string; temperature: number }[] = [];
  let skipped = 0;

  for (const row of rows) {
    const w = weatherMap.get(row.date);
    if (w) {
      const condition = codeToWeatherCondition(w.code);
      const temp = Math.round(w.temp * 10) / 10;
      toUpdate.push({ id: row.id, condition, temperature: temp });
    } else {
      skipped++;
    }
  }

  const CHUNK_SIZE = 200;
  let updated = 0;
  let failed = 0;

  if (toUpdate.length === 0) {
    console.log(`[weather/backfill] 0/0 적용`);
    return { total: rows.length, updated: 0, failed: 0, skipped };
  }

  for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
    const chunk = toUpdate.slice(i, i + CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map(async (item) => {
        const { error } = await supabase
          .from('daily_sales')
          .update({
            weather_condition: item.condition,
            temperature: item.temperature,
          })
          .eq('store_id', storeId)
          .eq('id', item.id);

        if (error) {
          console.error(`[weather/backfill] 행 업데이트 실패 (id: ${item.id}):`, error);
          return false;
        }
        return true;
      })
    );

    const chunkSuccess = results.filter(Boolean).length;
    const chunkFailed = results.length - chunkSuccess;
    updated += chunkSuccess;
    failed += chunkFailed;

    console.log(`[weather/backfill] ${updated}/${toUpdate.length} 적용`);
  }

  return {
    total: rows.length,
    updated,
    failed,
    skipped,
  };
}

/**
 * 매장 전체 과거 날씨 일괄 재채움
 */
export async function backfillStoreWeather(
  supabase: SupabaseClient,
  storeId: string,
  lat: number,
  lon: number
): Promise<WeatherBackfillResult> {
  console.log(`[weather/backfill] 매장(${storeId}) 전체 daily_sales 조회 시작...`);
  const { data: rows, error } = await fetchAll<{ id: string; date: string }>(
    () =>
      supabase
        .from('daily_sales')
        .select('id, date')
        .eq('store_id', storeId)
        .order('date', { ascending: true })
        .order('id'),
    { pageSize: 1000, maxRows: 20000 }
  );

  if (error || !rows) {
    throw new Error(`daily_sales 조회 실패: ${error?.message || '데이터 없음'}`);
  }

  console.log(`[weather/backfill] 총 ${rows.length}개 일자 대상`);
  const uniqueDates = Array.from(new Set(rows.map((r) => r.date))).sort();
  const weatherMap = await collectWeatherMap(lat, lon, uniqueDates);

  return await applyWeatherUpdates(supabase, storeId, rows, weatherMap);
}

/**
 * 특정 연·월(YYYY-MM) 매장 과거 날씨 자동 채움 (OKPOS 가져오기 연동용)
 */
export async function backfillStoreWeatherForMonth(
  supabase: SupabaseClient,
  storeId: string,
  lat: number,
  lon: number,
  yearMonth: string
): Promise<WeatherBackfillResult> {
  const startDate = `${yearMonth}-01`;
  const endDate = `${yearMonth}-31`;

  console.log(`[weather/backfill] 매장(${storeId}) ${yearMonth} daily_sales 조회 시작...`);
  const { data: rows, error } = await fetchAll<{ id: string; date: string }>(
    () =>
      supabase
        .from('daily_sales')
        .select('id, date')
        .eq('store_id', storeId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })
        .order('id'),
    { pageSize: 1000, maxRows: 1000 }
  );

  if (error || !rows || rows.length === 0) {
    console.log(`[weather/backfill] ${yearMonth} 대상 행 없음`);
    return { total: 0, updated: 0, failed: 0, skipped: 0 };
  }

  console.log(`[weather/backfill] ${yearMonth} 총 ${rows.length}개 일자 대상`);
  const uniqueDates = Array.from(new Set(rows.map((r) => r.date))).sort();
  const weatherMap = await collectWeatherMap(lat, lon, uniqueDates);

  return await applyWeatherUpdates(supabase, storeId, rows, weatherMap);
}
