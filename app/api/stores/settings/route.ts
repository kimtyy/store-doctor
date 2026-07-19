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
      .select('owner_salary, loan_repayment')
      .eq('id', storeId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ data: { owner_salary: 0, loan_repayment: 0 } });
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
    const { owner_salary, loan_repayment } = body;

    const { error } = await supabase
      .from('stores')
      .update({
        owner_salary: owner_salary || 0,
        loan_repayment: loan_repayment || 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', storeId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Saved successfully' });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
