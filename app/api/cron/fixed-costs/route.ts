import { NextResponse } from 'next/server';
import { applyFixedCostsForAllStores } from '@/lib/fixedCosts';

export const dynamic = 'force-dynamic';

// GET /api/cron/fixed-costs
// Vercel Cron or scheduled service endpoint to trigger fixed cost auto-apply for all stores
export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get('authorization');
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 });
      }
    }

    const results = await applyFixedCostsForAllStores('cron');
    const totalApplied = results.reduce((sum, r) => sum + r.appliedCount, 0);

    return NextResponse.json({
      success: true,
      processedStores: results.length,
      totalApplied,
      results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
