import { NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/utils/supabase/server';
import { getStoreId } from '@/utils/supabase/getStore';
import { getStoreUsage } from '@/lib/usage';
import { PLANS } from '@/lib/plans';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const storeId = await getStoreId();
    if (!storeId) {
      return NextResponse.json({
        ok: true,
        plan: 'free',
        features: PLANS.free.features,
        usage: {
          ocr: { used: 0, limit: PLANS.free.ocrMonthlyLimit },
          ai: { used: 0, limit: PLANS.free.aiMonthlyCredits },
        },
        limitExempt: false,
      });
    }

    const summary = await getStoreUsage(storeId);
    return NextResponse.json({
      ok: true,
      plan: summary.plan,
      features: PLANS[summary.plan].features,
      usage: {
        ocr: summary.ocr,
        ai: summary.ai,
      },
      limitExempt: summary.limitExempt,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '플랜 조회 실패' }, { status: 500 });
  }
}

