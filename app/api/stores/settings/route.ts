import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getStoreId } from '@/utils/supabase/getStore';
import { getUserRole } from '@/utils/supabase/getUserRole';

export const dynamic = 'force-dynamic';

// GET /api/stores/settings - 매장 설정 및 위치 정보 조회 (전체 구성원 허용)
export async function GET() {
  const storeId = await getStoreId();
  if (!storeId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient();
  try {
    let { data, error } = await supabase
      .from('stores')
      .select('owner_salary, loan_repayment, onboarding_guide_seen, address, latitude, longitude')
      .eq('id', storeId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({
          data: {
            owner_salary: 0,
            loan_repayment: 0,
            onboarding_guide_seen: false,
            address: null,
            latitude: null,
            longitude: null,
          },
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

// PATCH /api/stores/settings - 매장 설정 및 위치 정보 수정 (소유자 전용 403)
export async function PATCH(request: Request) {
  const storeId = await getStoreId();
  if (!storeId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await getUserRole();
  if (role !== 'owner') {
    return NextResponse.json(
      { error: '매장 위치 및 설정은 매장 소유자만 변경할 수 있습니다.' },
      { status: 403 }
    );
  }

  const supabase = createClient();
  try {
    const body = await request.json();
    const { owner_salary, loan_repayment, onboarding_guide_seen, address, latitude, longitude } = body;

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (owner_salary !== undefined) payload.owner_salary = owner_salary;
    if (loan_repayment !== undefined) payload.loan_repayment = loan_repayment;
    if (onboarding_guide_seen !== undefined) payload.onboarding_guide_seen = onboarding_guide_seen;

    if (address !== undefined) {
      payload.address = address ? String(address).trim() : null;
    }

    // 좌표 검증 (위도 33~39, 경도 124~132). 빈 값/null 허용
    if (latitude !== undefined) {
      if (latitude === null || latitude === '' || Number.isNaN(Number(latitude))) {
        if (latitude !== null && latitude !== '') {
          return NextResponse.json(
            { error: '한국 안의 위치만 입력할 수 있어요(위도·경도가 바뀌었는지 확인해 주세요)' },
            { status: 400 }
          );
        }
        payload.latitude = null;
      } else {
        const lat = Number(latitude);
        if (lat < 33 || lat > 39) {
          return NextResponse.json(
            { error: '한국 안의 위치만 입력할 수 있어요(위도·경도가 바뀌었는지 확인해 주세요)' },
            { status: 400 }
          );
        }
        payload.latitude = lat;
      }
    }

    if (longitude !== undefined) {
      if (longitude === null || longitude === '' || Number.isNaN(Number(longitude))) {
        if (longitude !== null && longitude !== '') {
          return NextResponse.json(
            { error: '한국 안의 위치만 입력할 수 있어요(위도·경도가 바뀌었는지 확인해 주세요)' },
            { status: 400 }
          );
        }
        payload.longitude = null;
      } else {
        const lon = Number(longitude);
        if (lon < 124 || lon > 132) {
          return NextResponse.json(
            { error: '한국 안의 위치만 입력할 수 있어요(위도·경도가 바뀌었는지 확인해 주세요)' },
            { status: 400 }
          );
        }
        payload.longitude = lon;
      }
    }

    const { error } = await supabase
      .from('stores')
      .update(payload)
      .eq('id', storeId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Saved successfully' });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
