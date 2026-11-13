import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getStoreId } from '@/utils/supabase/getStore';
import { getUserRole } from '@/utils/supabase/getUserRole';
import {
  parseOkposMenuDaily,
  OkposParseResult,
  OkposParsedMenuRow,
  OkposDaySale,
} from '@/lib/parsers/okposMenuDaily';
import { buildMenuMasterIndex, resolveMenuWithIndex } from '@/lib/menus';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase 환경 변수가 설정되지 않았습니다.');
  return createAdminClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// GET /api/import/okpos - 최근 가져온 묶음(import_batches) 목록 조회
export async function GET() {
  const normalSupabase = createServerClient();
  const { data: { user } } = await normalSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await getUserRole();
  if (role !== 'owner') {
    return NextResponse.json({ error: '과거 매출 관리는 매장 소유자만 가능합니다.' }, { status: 403 });
  }

  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = makeAdminClient();
    const { data, error } = await supabase
      .from('import_batches')
      .select('*')
      .eq('store_id', STORE_ID)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ batches: data ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '가져오기 내역 조회 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/import/okpos - 미리보기(preview) 또는 실제 저장(save)
export async function POST(request: Request) {
  const normalSupabase = createServerClient();
  const { data: { user } } = await normalSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await getUserRole();
  if (role !== 'owner') {
    return NextResponse.json({ error: '과거 매출 가져오기는 매장 소유자만 가능합니다.' }, { status: 403 });
  }

  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await request.formData();
    const action = (formData.get('action') as string) || 'preview';
    const yearMonth = formData.get('year_month') as string;
    const mode = (formData.get('mode') as string) || 'fill'; // 'fill' | 'overwrite'
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: '파일을 첨부해 주세요.' }, { status: 400 });
    }
    if (!yearMonth) {
      return NextResponse.json({ error: '연·월(YYYY-MM)을 선택해 주세요.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const parsed: OkposParseResult = parseOkposMenuDaily(arrayBuffer, yearMonth);

    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const supabase = makeAdminClient();
    const fileSha256 = parsed.fileSha256!;
    const fileName = file.name;

    // 1. 중복 파일(sha256) 여부 확인
    const { data: dupBatches } = await supabase
      .from('import_batches')
      .select('id, year_month, file_name, created_at, undone_at')
      .eq('store_id', STORE_ID)
      .eq('file_sha256', fileSha256)
      .is('undone_at', null);

    const isDuplicateFile = (dupBatches ?? []).length > 0;
    const duplicateBatchInfo = isDuplicateFile ? dupBatches![0] : null;

    // 2. 이미 앱에 등록된 해당 월의 일별 매출 조회
    const fromDate = `${yearMonth}-01`;
    const toDate = `${yearMonth}-${String(parsed.daysInMonth).padStart(2, '0')}`;
    const { data: existingSales } = await supabase
      .from('daily_sales')
      .select('date, net_revenue, total_revenue')
      .eq('store_id', STORE_ID)
      .gte('date', fromDate)
      .lte('date', toDate);

    const existingSalesMap = new Map<string, { net_revenue: number; total_revenue: number }>();
    for (const s of existingSales ?? []) {
      existingSalesMap.set(s.date, { net_revenue: s.net_revenue, total_revenue: s.total_revenue });
    }

    // 3. menu_master 및 aliases 대조 -> 처음 보는 메뉴 목록 추출
    const { data: masterRows } = await supabase
      .from('menu_master')
      .select('menu_name, category, aliases')
      .eq('store_id', STORE_ID);

    const masterIndex = buildMenuMasterIndex(masterRows ?? []);
    const newMenusSet = new Set<string>();

    for (const m of parsed.menuRows ?? []) {
      const resolved = resolveMenuWithIndex(m.rawName, masterIndex, null);
      if (!resolved.matchedMaster) {
        newMenusSet.add(resolved.canonicalName);
      }
    }
    const newMenus = Array.from(newMenusSet);

    // 4. 겹치는 날짜 및 차이(1% 또는 1,000원 초과) 분석
    const existingDaysCount = existingSalesMap.size;
    const conflictingDays: Array<{
      date: string;
      appNetRevenue: number;
      fileNetRevenue: number;
      diffAmount: number;
      diffPercent: number;
    }> = [];

    let daysToInsert = 0;
    let daysToOverwrite = 0;

    for (const ds of parsed.daySummaries ?? []) {
      if (ds.isFutureDate || ds.isZeroRevenue) continue;

      const appSale = existingSalesMap.get(ds.date);
      if (appSale) {
        daysToOverwrite++;
        const diffAmt = Math.abs(appSale.net_revenue - ds.netRevenue);
        const diffPct = appSale.net_revenue > 0 ? (diffAmt / appSale.net_revenue) * 100 : 100;
        if (diffAmt > 1000 || diffPct > 1.0) {
          conflictingDays.push({
            date: ds.date,
            appNetRevenue: appSale.net_revenue,
            fileNetRevenue: ds.netRevenue,
            diffAmount: diffAmt,
            diffPercent: Math.round(diffPct * 10) / 10,
          });
        }
      } else {
        daysToInsert++;
      }
    }

    // --- Action: PREVIEW ---
    if (action === 'preview') {
      return NextResponse.json({
        ok: true,
        preview: {
          yearMonth,
          fileName,
          fileSha256,
          isDuplicateFile,
          duplicateBatchInfo,
          totalAmount: parsed.grandTotalAmount,
          netRevenue: parsed.grandNetRevenue,
          tax: parsed.grandTax,
          menuCount: parsed.menuRows?.length ?? 0,
          openDaysCount: parsed.openDaysCount ?? 0,
          zeroRevenueDays: parsed.zeroRevenueDays ?? [],
          existingDaysCount,
          daysToInsert,
          daysToOverwrite,
          conflictingDays,
          newMenusCount: newMenus.length,
          newMenus,
        },
      });
    }

    // --- Action: SAVE ---
    if (action === 'save') {
      if (mode !== 'fill' && mode !== 'overwrite') {
        return NextResponse.json({ error: '올바른 가져오기 모드를 선택해 주세요. (fill 또는 overwrite)' }, { status: 400 });
      }

      // 1. import_batches 레코드 생성
      const { data: batchData, error: batchErr } = await supabase
        .from('import_batches')
        .insert({
          store_id: STORE_ID,
          source: 'okpos_menu_daily',
          year_month: yearMonth,
          file_name: fileName,
          file_sha256: fileSha256,
          days_written: 0,
          menu_rows: 0,
          total_amount: parsed.grandTotalAmount ?? 0,
          mode,
          created_by: user.id,
        })
        .select('*')
        .single();

      if (batchErr || !batchData) {
        throw new Error(batchErr?.message || '배치 레코드 생성 실패');
      }

      const batchId = batchData.id;
      let totalDaysWritten = 0;
      let totalMenuRowsWritten = 0;

      try {
        // 일자별 처리
        for (const ds of parsed.daySummaries ?? []) {
          if (ds.isFutureDate || ds.isZeroRevenue) continue;

          const exists = existingSalesMap.has(ds.date);
          if (exists && mode === 'fill') {
            // 빈 날짜만 채우기: 기존 날짜는 건너뜀
            continue;
          }

          if (exists && mode === 'overwrite') {
            // 덮어쓰기: 기존 daily_sales 행 삭제 (sales_menu_items는 CASCADE 삭제됨)
            const { error: delErr } = await supabase
              .from('daily_sales')
              .delete()
              .eq('store_id', STORE_ID)
              .eq('date', ds.date);
            if (delErr) throw delErr;
          }

          // daily_sales 행 삽입
          const { data: saleData, error: saleErr } = await supabase
            .from('daily_sales')
            .insert({
              store_id: STORE_ID,
              date: ds.date,
              total_revenue: ds.totalAmount,
              actual_sales: ds.totalAmount,
              discount: 0,
              service_charge: 0,
              service_amount: 0,
              tax: ds.tax,
              net_revenue: ds.netRevenue,
              cash_count: 0,
              cash_amount: 0,
              card_count: 0,
              card_amount: 0,
              tables_used: 0,
              guest_count: 0,
              avg_spend: 0,
              input_method: 'excel_upload',
              import_batch_id: batchId,
              created_by: user.id,
              is_event: false,
              weather_condition: null,
              temperature: null,
            })
            .select('id')
            .single();

          if (saleErr || !saleData) throw (saleErr || new Error('daily_sales 저장 실패'));
          const dailySaleId = saleData.id;
          totalDaysWritten++;

          // 해당 일자의 메뉴 항목 수집
          const dayMenuItems: Array<{
            daily_sale_id: string;
            import_batch_id: string;
            name: string;
            quantity: number;
            amount: number;
            category: string | null;
          }> = [];

          for (const m of parsed.menuRows ?? []) {
            const saleOnDay: OkposDaySale | undefined = m.dailySales[ds.day - 1];
            // 수량 0 & 금액 0 행은 저장 안 함. 서비스(수량>0 & 금액 0)는 저장.
            if (!saleOnDay || (saleOnDay.quantity <= 0 && saleOnDay.amount <= 0)) {
              continue;
            }

            const resolved = resolveMenuWithIndex(m.rawName, masterIndex, null);
            dayMenuItems.push({
              daily_sale_id: dailySaleId,
              import_batch_id: batchId,
              name: resolved.canonicalName,
              quantity: saleOnDay.quantity,
              amount: saleOnDay.amount,
              category: resolved.matchedMaster ? resolved.rawCategory : null,
            });
          }

          if (dayMenuItems.length > 0) {
            // 배치 분할 insert (최대 100건씩)
            for (let i = 0; i < dayMenuItems.length; i += 100) {
              const chunk = dayMenuItems.slice(i, i + 100);
              const { error: miErr } = await supabase.from('sales_menu_items').insert(chunk);
              if (miErr) throw miErr;
            }
            totalMenuRowsWritten += dayMenuItems.length;
          }
        }

        // import_batches 업데이트 (성공한 일수·메뉴행수)
        await supabase
          .from('import_batches')
          .update({
            days_written: totalDaysWritten,
            menu_rows: totalMenuRowsWritten,
          })
          .eq('id', batchId);

        return NextResponse.json({
          ok: true,
          batchId,
          daysWritten: totalDaysWritten,
          menuRowsWritten: totalMenuRowsWritten,
          mode,
          message: `${yearMonth} 매출 가져오기가 완료되었습니다. (${totalDaysWritten}일 기록, 메뉴 ${totalMenuRowsWritten}건)`,
        });
      } catch (saveError) {
        // 실패 시 롤백: 이번 batch_id로 쓰인 daily_sales 삭제 및 batch 레코드 삭제
        console.error('OKPOS 가져오기 중 오류 발생, 롤백 수행:', saveError);
        await supabase.from('daily_sales').delete().eq('import_batch_id', batchId);
        await supabase.from('import_batches').delete().eq('id', batchId);
        throw saveError;
      }
    }

    return NextResponse.json({ error: '지원하지 않는 action입니다.' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OKPOS 가져오기 처리 중 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/import/okpos - 가져오기 취소 (batchId)
export async function DELETE(request: Request) {
  const normalSupabase = createServerClient();
  const { data: { user } } = await normalSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await getUserRole();
  if (role !== 'owner') {
    return NextResponse.json({ error: '가져오기 취소는 매장 소유자만 가능합니다.' }, { status: 403 });
  }

  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('id');
    if (!batchId) {
      return NextResponse.json({ error: '취소할 묶음 ID(id)가 필요합니다.' }, { status: 400 });
    }

    const supabase = makeAdminClient();
    const { data: batch, error: getErr } = await supabase
      .from('import_batches')
      .select('*')
      .eq('id', batchId)
      .eq('store_id', STORE_ID)
      .maybeSingle();

    if (getErr || !batch) {
      return NextResponse.json({ error: '해당 가져오기 묶음을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (batch.undone_at) {
      return NextResponse.json({ error: '이미 취소된 가져오기 묶음입니다.' }, { status: 400 });
    }

    // 해당 batchId로 생성된 daily_sales 삭제 (sales_menu_items는 CASCADE 삭제)
    const { error: delErr } = await supabase
      .from('daily_sales')
      .delete()
      .eq('store_id', STORE_ID)
      .eq('import_batch_id', batchId);

    if (delErr) throw delErr;

    // import_batches에 undone_at 기록
    const { error: updErr } = await supabase
      .from('import_batches')
      .update({ undone_at: new Date().toISOString() })
      .eq('id', batchId);

    if (updErr) throw updErr;

    return NextResponse.json({
      ok: true,
      message: `${batch.year_month} 가져오기가 취소되었습니다. (해당 묶음으로 생성된 매출 행 삭제 완료)`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '가져오기 취소 중 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
