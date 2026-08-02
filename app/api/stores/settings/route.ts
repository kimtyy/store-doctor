import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getStoreId } from '@/utils/supabase/getStore';

export const dynamic = 'force-dynamic';

// GET /api/stores/settings
export async function GET() {
  const storeId = await getStoreId();
  if (!storeId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from('stores')
      .select('owner_salary, loan_repayment, onboarding_guide_seen')
      .eq('id', storeId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ data: { owner_salary: 0, loan_repayment: 0, onboarding_guide_seen: false } });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

// PATCH /api/stores/settings
export async function PATCH(request: Request) {
  const storeId = await getStoreId();
  if (!storeId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient();
  try {
    const body = await request.json();
    const { owner_salary, loan_repayment, onboarding_guide_seen } = body;

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };
    if (owner_salary !== undefined) payload.owner_salary = owner_salary;
    if (loan_repayment !== undefined) payload.loan_repayment = loan_repayment;
    if (onboarding_guide_seen !== undefined) payload.onboarding_guide_seen = onboarding_guide_seen;

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
