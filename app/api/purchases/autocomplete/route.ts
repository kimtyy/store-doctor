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

export async function GET(request: Request) {
  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const type = searchParams.get('type') ?? 'vendor';

  if (!q) return NextResponse.json({ suggestions: [] });

  try {
    const supabase = makeClient();

    if (type === 'vendor') {
      const { data, error } = await supabase
        .from('purchase_records')
        .select('vendor_name')
        .eq('store_id', STORE_ID)
        .ilike('vendor_name', `%${q}%`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const seen = new Set<string>();
      const suggestions: string[] = [];
      for (const row of data ?? []) {
        const name = (row.vendor_name as string)?.trim();
        if (name && !seen.has(name)) {
          seen.add(name);
          suggestions.push(name);
          if (suggestions.length >= 5) break;
        }
      }
      return NextResponse.json({ suggestions });
    }

    // type === 'item': scan recent purchase items
    const { data, error } = await supabase
      .from('purchase_records')
      .select('items')
      .eq('store_id', STORE_ID)
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) throw error;

    const lq = q.toLowerCase();
    const seen = new Set<string>();
    const suggestions: string[] = [];

    for (const row of data ?? []) {
      const items = (row.items ?? []) as { name?: string }[];
      for (const item of items) {
        const name = item.name?.trim();
        if (name && name.toLowerCase().includes(lq) && !seen.has(name)) {
          seen.add(name);
          suggestions.push(name);
          if (suggestions.length >= 5) break;
        }
      }
      if (suggestions.length >= 5) break;
    }
    return NextResponse.json({ suggestions });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '오류';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
