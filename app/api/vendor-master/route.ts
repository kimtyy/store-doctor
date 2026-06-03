import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStoreId } from '@/utils/supabase/getStore';

export const dynamic = 'force-dynamic';



function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase 환경 변수 누락');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// GET — list vendor_master + unmapped vendors from purchase_records
export async function GET() {
  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = makeClient();

    const [masterRes, purchaseRes] = await Promise.all([
      supabase
        .from('vendor_master')
        .select('id, vendor_name, aliases')
        .eq('store_id', STORE_ID)
        .order('vendor_name'),
      supabase
        .from('purchase_records')
        .select('vendor_name')
        .eq('store_id', STORE_ID)
        .not('vendor_name', 'is', null),
    ]);

    if (masterRes.error) throw new Error(masterRes.error.message);
    if (purchaseRes.error) throw new Error(purchaseRes.error.message);

    const masterData = masterRes.data ?? [];

    const knownNames = new Set<string>();
    for (const m of masterData) {
      knownNames.add(m.vendor_name);
      for (const alias of m.aliases ?? []) knownNames.add(alias);
    }

    const allVendors = new Set<string>();
    for (const r of purchaseRes.data ?? []) {
      if (r.vendor_name?.trim()) allVendors.add(r.vendor_name.trim());
    }

    const unmapped = [...allVendors].filter((v) => !knownNames.has(v)).sort();

    return NextResponse.json({ data: masterData, unmapped });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — create new vendor_master entry
export async function POST(request: Request) {
  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = makeClient();
    const body = await request.json().catch(() => null);
    if (!body?.vendorName?.trim()) {
      return NextResponse.json({ error: 'vendorName이 필요합니다.' }, { status: 400 });
    }

    const { vendorName, aliases = [] } = body as { vendorName: string; aliases?: string[] };

    const { data, error } = await supabase
      .from('vendor_master')
      .insert({ store_id: STORE_ID, vendor_name: vendorName.trim(), aliases })
      .select('id, vendor_name, aliases')
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH — update vendor_name or aliases
export async function PATCH(request: Request) {
  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = makeClient();
    const body = await request.json().catch(() => null);
    if (!body?.id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });

    const { id, vendorName, aliases } = body as {
      id: string;
      vendorName?: string;
      aliases?: string[];
    };

    const payload: Record<string, unknown> = {};
    if (vendorName !== undefined) payload.vendor_name = vendorName.trim();
    if (aliases !== undefined) payload.aliases = aliases;

    const { error } = await supabase
      .from('vendor_master')
      .update(payload)
      .eq('id', id)
      .eq('store_id', STORE_ID);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE — remove entry by ?id=
export async function DELETE(request: Request) {
  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = makeClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });

    const { error } = await supabase
      .from('vendor_master')
      .delete()
      .eq('id', id)
      .eq('store_id', STORE_ID);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
