import { NextResponse } from 'next/server';
import { getStoreId } from '@/utils/supabase/getStore';
import { applyFixedCostsForStore } from '@/lib/fixedCosts';

export const dynamic = 'force-dynamic';

// POST /api/fixed-costs/apply
// 현재 매장의 활성 고정비를 purchase_records에 자동 삽입/백필
export async function POST() {
  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const result = await applyFixedCostsForStore(STORE_ID, 'manual');
    return NextResponse.json({
      success: true,
      applied: result.appliedCount,
      skipped: result.skippedCount,
      errors: result.errorCount,
      details: result.details,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

