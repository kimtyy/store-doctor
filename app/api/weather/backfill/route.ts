import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getStoreId } from '@/utils/supabase/getStore';
import { getUserRole } from '@/utils/supabase/getUserRole';
import { backfillStoreWeather } from '@/lib/weatherBackfill';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/weather/backfill
 * 매장의 과거 전체 매출에 대해 설정된 매장 좌표 기준의 날씨 및 기온을 재채움합니다. (소유자 전용)
 */
export async function POST() {
  const storeId = await getStoreId();
  if (!storeId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role = await getUserRole();
  if (role !== 'owner') {
    return NextResponse.json(
      { error: '과거 날씨 일괄 재채움은 매장 소유자만 가능합니다.' },
      { status: 403 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: 'Supabase 환경 변수가 설정되지 않았습니다.' },
      { status: 500 }
    );
  }

  const adminClient = createAdminClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 매장 좌표 확인
  const { data: store, error: storeErr } = await adminClient
    .from('stores')
    .select('latitude, longitude')
    .eq('id', storeId)
    .single();

  if (
    storeErr ||
    !store ||
    store.latitude === null ||
    store.longitude === null ||
    isNaN(Number(store.latitude)) ||
    isNaN(Number(store.longitude))
  ) {
    return NextResponse.json({ error: '매장 위치를 먼저 설정해 주세요' }, { status: 400 });
  }

  try {
    const result = await backfillStoreWeather(
      adminClient,
      storeId,
      Number(store.latitude),
      Number(store.longitude)
    );

    return NextResponse.json({
      ok: true,
      total: result.total,
      updated: result.updated,
      failed: result.failed,
      skipped: result.skipped,
      message: `과거 날씨 재채움 완료: ${result.updated}일 갱신 (실패 ${result.failed}일)`,
    });
  } catch (err: any) {
    console.error('[weather/backfill] 오류:', err);
    return NextResponse.json(
      { error: err?.message || '과거 날씨 재채움 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
