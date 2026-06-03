import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/stores/settings
export async function GET() {
  const storeId = '8de2930d-a196-4aa1-b9bf-7fa83321b10c'; // hardcoded for now as per other routes

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
  const storeId = '8de2930d-a196-4aa1-b9bf-7fa83321b10c';

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
