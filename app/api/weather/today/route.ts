import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getStoreId } from '@/utils/supabase/getStore';
import { getWeatherInfo } from '@/lib/weather';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

// GET /api/weather/today - 오늘 영업 참고 날씨 조회
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = await getStoreId();
  if (!storeId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { data: store, error: storeErr } = await supabase
      .from('stores')
      .select('latitude, longitude')
      .eq('id', storeId)
      .single();

    if (storeErr || !store || store.latitude === null || store.longitude === null) {
      return NextResponse.json({ ok: true, hasLocation: false, storeId });
    }

    // 소수점 2자리 반올림 (같은 동네 매장 간 캐시 공유)
    const lat2 = Number(store.latitude).toFixed(2);
    const lon2 = Number(store.longitude).toFixed(2);

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat2}&longitude=${lon2}&current=temperature_2m,weather_code&hourly=temperature_2m&daily=weather_code,temperature_2m_mean&timezone=Asia%2FSeoul&forecast_days=2`;

    // 8초 타임아웃 및 실패 시 1초 쉬고 1회 재시도 (4xx는 429 제외하고 재시도 안 함)
    let res: Response | null = null;
    let lastError: any = null;
    let lastStatus: number | null = null;
    let totalAttempts = 0;

    for (let attempt = 1; attempt <= 2; attempt++) {
      totalAttempts = attempt;
      const startTime = Date.now();
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(8000),
          next: { revalidate: 1800 },
        });
        const durationMs = Date.now() - startTime;

        if (response.ok) {
          res = response;
          break;
        }

        lastStatus = response.status;
        console.warn(
          `[Open-Meteo] 호출 실패 (시도 ${attempt}/2) - status: ${response.status}, duration: ${durationMs}ms`
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
        const durationMs = Date.now() - startTime;
        lastError = err;
        const errName = err?.name || 'Error';
        console.warn(
          `[Open-Meteo] 예외 발생 (시도 ${attempt}/2) - exception: ${errName}, message: ${err?.message}, duration: ${durationMs}ms`
        );

        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }

    if (!res || !res.ok) {
      const statusToReport = res ? res.status : (lastStatus || 500);
      console.error(
        `[Open-Meteo] 최종 실패 (총 ${totalAttempts}회 시도) - status: ${statusToReport}, lastException: ${lastError?.name || 'None'}`
      );
      return NextResponse.json(
        { ok: false, error: '날씨 정보를 불러오지 못했어요' },
        { status: statusToReport >= 500 || statusToReport === 429 ? 502 : 400 }
      );
    }

    const data = await res.json();
    const currentTemp = Math.round(data.current?.temperature_2m ?? 0);
    const weatherCode = data.current?.weather_code ?? 0;

    // 오늘 저녁 19~23시 평균 기온 계산
    let eveningTemp = currentTemp;
    if (Array.isArray(data.hourly?.time) && Array.isArray(data.hourly?.temperature_2m)) {
      const todayDate = (data.current?.time || new Date().toISOString()).slice(0, 10);
      const eveningTemps: number[] = [];
      for (let i = 0; i < data.hourly.time.length; i++) {
        const t = data.hourly.time[i];
        if (typeof t === 'string' && t.startsWith(todayDate)) {
          const hour = parseInt(t.slice(11, 13), 10);
          if (hour >= 19 && hour <= 23) {
            const tempVal = data.hourly.temperature_2m[i];
            if (typeof tempVal === 'number') {
              eveningTemps.push(tempVal);
            }
          }
        }
      }
      if (eveningTemps.length > 0) {
        const sum = eveningTemps.reduce((a, b) => a + b, 0);
        eveningTemp = Math.round(sum / eveningTemps.length);
      }
    }

    // 내일 일평균 기온 (W-3에서 활용 예정)
    const tomorrowMeanTemp =
      data.daily?.temperature_2m_mean?.[1] !== undefined
        ? Math.round(data.daily.temperature_2m_mean[1])
        : null;

    const weather = getWeatherInfo(weatherCode, currentTemp, eveningTemp, tomorrowMeanTemp);

    return NextResponse.json({
      ok: true,
      hasLocation: true,
      storeId,
      weather,
    });
  } catch (err) {
    console.error('날씨 조회 예외 발생:', err);
    return NextResponse.json(
      { ok: false, error: '날씨 정보를 불러오지 못했어요' },
      { status: 500 }
    );
  }
}

