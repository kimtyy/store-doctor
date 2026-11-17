import { unstable_cache } from 'next/cache';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { fetchAll } from '@/lib/supabase/fetchAll';
import { getHolidaysInRange } from '@/lib/holidays';

export interface SensitivityStage {
  k: number; // 0, 1, 2, 3
  effect: number; // e.g. -0.213
  roundedPercent: number; // 5% 단위 반올림 (e.g. -20 for -20%)
  n: number; // 표본 수 n_k
  hasSignificantEffect: boolean; // effect <= -0.05
}

export interface StoreSensitivityResult {
  storeId: string;
  spanDays: number;
  totalDrops: number;
  winterDrops: number;
  isEligible: boolean; // spanDays >= 365 && totalDrops >= 20
  stages: Record<number, SensitivityStage>; // 0, 1, 2, 3
  winterStage2: SensitivityStage | null; // 겨울 k=2 단계 (겨울 급락 >= 10일 때)
  meanLnCalm: number;
  calculatedAt: string;
}

export interface RawSaleRecord {
  date: string;
  net_revenue: number;
  temperature: number | null;
}

/**
 * [순수 함수] 민감도 계산식 (지시문 ■B)
 * - 유효일: net_revenue > 0 & 공휴일 아님
 * - r(d): 같은 요일 직전 유효일 4회 평균 대비 (56일 이내, 최소 3회), [0.2, 3.0] 클립, ln
 * - 평온일 C: |Δ| < 2.0 & C-1~C-3 급락 없음 & r(C) 유효
 * - 효과_k: exp(mean ln r(D+k) - mean ln r(C)) - 1 (k = 0~3)
 * - 겨울 2단계: D가 12·1·2월인 급락일에 대해 D+2 효과 (겨울 급락 >= 10일 때)
 */
export function calculateTempDropSensitivity(
  salesRows: RawSaleRecord[],
  holidayDateSet: Set<string>,
  storeId: string = ''
): StoreSensitivityResult {
  if (salesRows.length === 0) {
    return {
      storeId,
      spanDays: 0,
      totalDrops: 0,
      winterDrops: 0,
      isEligible: false,
      stages: {},
      winterStage2: null,
      meanLnCalm: 0,
      calculatedAt: new Date().toISOString(),
    };
  }

  // 날짜순 오름차순 정렬
  const sorted = [...salesRows].sort((a, b) => a.date.localeCompare(b.date));

  const minDateStr = sorted[0].date;
  const maxDateStr = sorted[sorted.length - 1].date;
  const minDate = new Date(minDateStr);
  const maxDate = new Date(maxDateStr);
  const spanDays = Math.round((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // 1. 유효일 및 기본 정보 Map 구성
  const dateMap = new Map<
    string,
    {
      date: string;
      net_revenue: number;
      temperature: number | null;
      isHoliday: boolean;
      isValid: boolean;
      r: number | null;
      ln_r: number | null;
    }
  >();

  sorted.forEach((r) => {
    const isHoliday = holidayDateSet.has(r.date);
    const isValid = (r.net_revenue ?? 0) > 0 && !isHoliday;
    dateMap.set(r.date, {
      date: r.date,
      net_revenue: r.net_revenue,
      temperature: r.temperature,
      isHoliday,
      isValid,
      r: null,
      ln_r: null,
    });
  });

  // 2. r(d) 계산: 같은 요일 직전 유효일 4회 평균 대비 (56일 이내, 최소 3회), 0.2~3.0 클립, ln
  for (const [dateStr, item] of dateMap.entries()) {
    if (!item.isValid) continue;

    const curDate = new Date(dateStr);
    const pastValidRevs: number[] = [];

    for (let daysAgo = 7; daysAgo <= 56; daysAgo += 7) {
      const pastD = new Date(curDate);
      pastD.setDate(pastD.getDate() - daysAgo);
      const pastStr = pastD.toISOString().slice(0, 10);
      const pastItem = dateMap.get(pastStr);
      if (pastItem && pastItem.isValid) {
        pastValidRevs.push(pastItem.net_revenue);
        if (pastValidRevs.length === 4) break;
      }
    }

    if (pastValidRevs.length >= 3) {
      const baseline = pastValidRevs.reduce((a, b) => a + b, 0) / pastValidRevs.length;
      const rawR = item.net_revenue / baseline;
      const clippedR = Math.max(0.2, Math.min(3.0, rawR));
      item.r = clippedR;
      item.ln_r = Math.log(clippedR);
    }
  }

  // 3. Δ(d) = 평균(d-1) - 평균(d) 계산 (항상 연속 두 날)
  const deltaMap = new Map<string, number>();
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    const dPrev = new Date(prev.date);
    const dCurr = new Date(curr.date);
    const diffDays = Math.round((dCurr.getTime() - dPrev.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1 && prev.temperature !== null && curr.temperature !== null) {
      const delta = Math.round((prev.temperature - curr.temperature) * 10) / 10;
      deltaMap.set(curr.date, delta);
    }
  }

  // 4. 급락일 D (Δ(D) >= 3.0°C) 찾기
  interface DropDay {
    date: string;
    delta: number;
    month: number;
  }
  const dropDays: DropDay[] = [];
  const dropDateSet = new Set<string>();

  for (const [dateStr, delta] of deltaMap.entries()) {
    if (delta >= 3.0) {
      const month = parseInt(dateStr.slice(5, 7), 10);
      dropDays.push({ date: dateStr, delta, month });
      dropDateSet.add(dateStr);
    }
  }

  const winterDropDays = dropDays.filter((d) => [12, 1, 2].includes(d.month));
  const totalDrops = dropDays.length;
  const winterDrops = winterDropDays.length;

  // 5. 평온일 C: |Δ| < 2.0 & C-1~C-3 급락 없음 & r(C) 유효
  const calmDaysLnR: number[] = [];
  for (const [dateStr, item] of dateMap.entries()) {
    if (item.ln_r === null) continue;

    const delta = deltaMap.get(dateStr);
    if (delta === undefined || Math.abs(delta) >= 2.0) continue;

    const curD = new Date(dateStr);
    let hasRecentDrop = false;
    for (let k = 1; k <= 3; k++) {
      const pastD = new Date(curD);
      pastD.setDate(pastD.getDate() - k);
      const pastStr = pastD.toISOString().slice(0, 10);
      if (dropDateSet.has(pastStr)) {
        hasRecentDrop = true;
        break;
      }
    }

    if (!hasRecentDrop) {
      calmDaysLnR.push(item.ln_r);
    }
  }

  const meanLnCalm =
    calmDaysLnR.length > 0 ? calmDaysLnR.reduce((a, b) => a + b, 0) / calmDaysLnR.length : 0;

  // 6. 효과_k = exp(mean ln r(D+k) - mean ln r(C)) - 1 (k = 0~3)
  const stages: Record<number, SensitivityStage> = {};

  for (let k = 0; k <= 3; k++) {
    const samples: number[] = [];
    dropDays.forEach((d) => {
      const targetD = new Date(d.date);
      targetD.setDate(targetD.getDate() + k);
      const targetStr = targetD.toISOString().slice(0, 10);
      const targetItem = dateMap.get(targetStr);
      if (targetItem && targetItem.ln_r !== null) {
        samples.push(targetItem.ln_r);
      }
    });

    const n = samples.length;
    const meanLnK = n > 0 ? samples.reduce((a, b) => a + b, 0) / n : 0;
    const effect = n > 0 ? Math.exp(meanLnK - meanLnCalm) - 1 : 0;
    const roundedPercent = Math.round(effect * 20) * 5; // 5% 단위 반올림

    stages[k] = {
      k,
      effect,
      roundedPercent,
      n,
      hasSignificantEffect: effect <= -0.05,
    };
  }

  // 7. 겨울 2단계 (겨울 급락 >= 10일 때)
  let winterStage2: SensitivityStage | null = null;
  if (winterDrops >= 10) {
    const winterSamples: number[] = [];
    winterDropDays.forEach((d) => {
      const targetD = new Date(d.date);
      targetD.setDate(targetD.getDate() + 2); // k=2
      const targetStr = targetD.toISOString().slice(0, 10);
      const targetItem = dateMap.get(targetStr);
      if (targetItem && targetItem.ln_r !== null) {
        winterSamples.push(targetItem.ln_r);
      }
    });

    const n = winterSamples.length;
    const meanLnW2 = n > 0 ? winterSamples.reduce((a, b) => a + b, 0) / n : 0;
    const effect = n > 0 ? Math.exp(meanLnW2 - meanLnCalm) - 1 : 0;
    const roundedPercent = Math.round(effect * 20) * 5;

    winterStage2 = {
      k: 2,
      effect,
      roundedPercent,
      n,
      hasSignificantEffect: effect <= -0.05,
    };
  }

  const isEligible = spanDays >= 365 && totalDrops >= 20;

  return {
    storeId,
    spanDays,
    totalDrops,
    winterDrops,
    isEligible,
    stages,
    winterStage2,
    meanLnCalm,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * [조회 함수] 매장 민감도 계산 (unstable_cache 6시간 캐싱)
 */
export async function getStoreSensitivityCached(
  storeId: string
): Promise<StoreSensitivityResult> {
  const fetchAndCalculate = async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      throw new Error('Supabase configuration missing');
    }

    const adminClient = createAdminClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: rows, error } = await fetchAll<RawSaleRecord>(
      () =>
        adminClient
          .from('daily_sales')
          .select('date, net_revenue, total_revenue, temperature')
          .eq('store_id', storeId)
          .order('date', { ascending: true })
          .order('id'),
      { pageSize: 1000, maxRows: 20000 }
    );

    if (error || !rows || rows.length === 0) {
      return {
        storeId,
        spanDays: 0,
        totalDrops: 0,
        winterDrops: 0,
        isEligible: false,
        stages: {},
        winterStage2: null,
        meanLnCalm: 0,
        calculatedAt: new Date().toISOString(),
      };
    }

    // net_revenue 없으면 total_revenue 폴백
    const normalizedRows: RawSaleRecord[] = rows.map((r: any) => ({
      date: r.date,
      net_revenue: r.net_revenue ?? r.total_revenue ?? 0,
      temperature: r.temperature,
    }));

    const minDate = normalizedRows[0].date;
    const maxDate = normalizedRows[normalizedRows.length - 1].date;

    const holidays = getHolidaysInRange(minDate, maxDate);
    const holidayDateSet = new Set<string>();
    holidays.forEach((h) => {
      let cur = new Date(h.startDate);
      const end = new Date(h.endDate);
      while (cur <= end) {
        holidayDateSet.add(cur.toISOString().slice(0, 10));
        cur.setDate(cur.getDate() + 1);
      }
    });

    return calculateTempDropSensitivity(normalizedRows, holidayDateSet, storeId);
  };

  const cachedFn = unstable_cache(
    fetchAndCalculate,
    ['store_temp_drop_sensitivity', storeId],
    { revalidate: 21600, tags: [`store_sensitivity_${storeId}`] } // 6시간 (21600초)
  );

  return await cachedFn();
}
