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
    let { data, error } = await supabase
      .from('stores')
      .select('owner_salary, loan_repayment, onboarding_guide_seen')
      .eq('id', storeId)
      .single();

    if (error) {
      if (error.code === '42703') {
        const { data: retryData, error: retryError } = await supabase
          .from('stores')
          .select('onboarding_guide_seen')
          .eq('id', storeId)
          .single();

        if (retryError) {
          if (retryError.code === 'PGRST116') {
            return NextResponse.json({ data: { owner_salary: 0, loan_repayment: 0, onboarding_guide_seen: false } });
          }
          return NextResponse.json({ error: retryError.message }, { status: 500 });
        }
        return NextResponse.json({
          data: {
            owner_salary: 0,
            loan_repayment: 0,
            onboarding_guide_seen: retryData?.onboarding_guide_seen ?? false
          }
        });
      }

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
      if (error.code === '42703') {
        // If columns do not exist, try updating only onboarding_guide_seen if it was requested
        const cleanPayload: Record<string, unknown> = {
          updated_at: new Date().toISOString()
        };
        if (onboarding_guide_seen !== undefined) {
          cleanPayload.onboarding_guide_seen = onboarding_guide_seen;
          const { error: retryError } = await supabase
            .from('stores')
            .update(cleanPayload)
            .eq('id', storeId);
          if (retryError) {
            return NextResponse.json({ error: retryError.message }, { status: 500 });
          }
        }
        return NextResponse.json({ message: 'Saved successfully (non-operating expenses skipped as columns do not exist)' });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Saved successfully' });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
