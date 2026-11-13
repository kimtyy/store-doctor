import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getStoreId } from '@/utils/supabase/getStore';
import { getUserRole } from '@/utils/supabase/getUserRole';
import {
  parseOkposMenuDaily,
  OkposParseResult,
  OkposDaySale,
  getSeoulStartOfDayUtc,
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
    const msg = err instanceof Error ? err.message : '가져오기 묶음 목록을 불러오지 못했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/import/okpos - 미리보기(action=preview) 또는 실제 저장(action=save)
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
    const mode = (formData.get('mode') as string) || 'fill'; // 'fill' 만 지원
    const fillZeroSales = formData.get('fill_zero_sales') === 'true';
    const file = formData.get('file') as File | null;
    const rawHtml = formData.get('html_text') as string | null;

    if (!file && !rawHtml) {
      return NextResponse.json({ error: '파일을 첨부하거나 HTML 텍스트를 입력해 주세요.' }, { status: 400 });
    }
    if (file && file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: '파일 크기가 4MB를 초과했습니다. 4MB 이하 파일만 올릴 수 있어요.' }, { status: 413 });
    }
    if (!yearMonth) {
      return NextResponse.json({ error: '연·월(YYYY-MM)을 선택해 주세요.' }, { status: 400 });
    }

    const buffer: Uint8Array = file
      ? new Uint8Array(await file.arrayBuffer())
      : Buffer.from(rawHtml || '', 'utf8');

    const parsed: OkposParseResult = parseOkposMenuDaily(buffer, yearMonth);

    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const supabase = makeAdminClient();
    const fileSha256 = parsed.fileSha256!;
    const fileName = file ? file.name : `붙여넣기 ${yearMonth}`;

    // 1. 중복 파일(sha256) 여부 확인
    const { data: dupBatches } = await supabase
      .from('import_batches')
      .select('id, year_month, file_name, created_at, undone_at')
      .eq('store_id', STORE_ID)
      .eq('file_sha256', fileSha256)
      .is('undone_at', null);

    const isDuplicateFile = (dupBatches ?? []).length > 0;
    const duplicateBatchInfo = isDuplicateFile ? dupBatches![0] : null;

    // 2. 이미 해당 연·월에 취소되지 않은 묶음이 있는지 확인 (B-2)
    const { data: ymBatches } = await supabase
      .from('import_batches')
      .select('id, file_name, created_at')
      .eq('store_id', STORE_ID)
      .eq('year_month', yearMonth)
      .is('undone_at', null);

    const isAlreadyImported = (ymBatches ?? []).length > 0;

    // 3. 이미 앱에 등록된 해당 월의 일별 매출 조회
    const fromDate = `${yearMonth}-01`;
    const toDate = `${yearMonth}-${String(parsed.daysInMonth).padStart(2, '0')}`;
    const { data: existingSales, error: salesErr } = await supabase
      .from('daily_sales')
      .select('id, date, net_revenue, total_revenue, actual_sales, tax, discount, service_charge, service_amount, cash_count, cash_amount, card_count, card_amount, tables_used, guest_count, avg_spend, input_method, import_batch_id')
      .eq('store_id', STORE_ID)
      .gte('date', fromDate)
      .lte('date', toDate);

    if (salesErr) throw salesErr;

    const existingSalesMap = new Map<string, typeof existingSales[0]>();
    const zeroSaleCandidates: typeof existingSales = [];
    for (const s of existingSales ?? []) {
      existingSalesMap.set(s.date, s);
      if (s.net_revenue === 0) {
        zeroSaleCandidates.push(s);
      }
    }

    // 0원인 날 중 sales_menu_items가 0건인 날 확인 (C-8)
    const zeroSalesDaysMap = new Map<string, typeof existingSales[0]>();
    if (zeroSaleCandidates.length > 0) {
      const candidateIds = zeroSaleCandidates.map((c) => c.id);
      const { data: existingMenuItems, error: miCheckErr } = await supabase
        .from('sales_menu_items')
        .select('daily_sale_id')
        .in('daily_sale_id', candidateIds);

      if (!miCheckErr) {
        const salesWithMenus = new Set((existingMenuItems ?? []).map((m) => m.daily_sale_id));
        for (const candidate of zeroSaleCandidates) {
          if (!salesWithMenus.has(candidate.id)) {
            zeroSalesDaysMap.set(candidate.date, candidate);
          }
        }
      }
    }

    // 4. menu_master 및 aliases 대조 -> 처음 보는 메뉴 목록 추출 (C-4: 조회 오류 시 500 한국어 안내)
    const { data: masterRows, error: masterErr } = await supabase
      .from('menu_master')
      .select('menu_name, category, aliases')
      .eq('store_id', STORE_ID);

    if (masterErr) {
      console.error('menu_master 조회 오류:', masterErr);
      return NextResponse.json(
        { error: '메뉴 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' },
        { status: 500 }
      );
    }

    const masterIndex = buildMenuMasterIndex(masterRows ?? []);
    const newMenusSet = new Set<string>();

    for (const m of parsed.menuRows ?? []) {
      const resolved = resolveMenuWithIndex(m.rawName, masterIndex, null);
      if (!resolved.matchedMaster) {
        newMenusSet.add(resolved.canonicalName);
      }
    }
    const newMenus = Array.from(newMenusSet);

    // 5. 겹치는 날짜 및 차이 분석 + 0원 채우기 대상 일자 수집
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
    const zeroSalesDates: string[] = [];

    for (const ds of parsed.daySummaries ?? []) {
      if (ds.isFutureDate || ds.isZeroRevenue) continue;

      const appSale = existingSalesMap.get(ds.date);
      if (appSale) {
        if (zeroSalesDaysMap.has(ds.date)) {
          zeroSalesDates.push(ds.date);
        } else {
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
        }
      } else {
        daysToInsert++;
      }
    }

    const daysToFillZero = zeroSalesDates.length;

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
          isAlreadyImported,
          totalAmount: parsed.grandTotalAmount,
          netRevenue: parsed.grandNetRevenue,
          tax: parsed.grandTax,
          menuCount: parsed.menuRows?.length ?? 0,
          openDaysCount: parsed.openDaysCount ?? 0,
          zeroRevenueDays: parsed.zeroRevenueDays ?? [],
          existingDaysCount,
          daysToInsert,
          daysToFillZero,
          zeroSalesDates,
          daysToOverwrite,
          conflictingDays,
          newMenusCount: newMenus.length,
          newMenus,
        },
      });
    }

    // --- Action: SAVE ---
    if (action === 'save') {
      if (mode === 'overwrite') {
        return NextResponse.json(
          { error: '현재는 빈 날짜만 채우기만 지원합니다. 겹치는 날짜는 [일별 매출]에서 직접 수정해 주세요.' },
          { status: 400 }
        );
      }
      if (mode !== 'fill') {
        return NextResponse.json({ error: '올바른 가져오기 모드를 선택해 주세요. (fill)' }, { status: 400 });
      }

      // B-2: 남발 방지 - 하루 60회 상한 검사 (Asia/Seoul 00:00 KST = UTC)
      const startOfDayUtc = getSeoulStartOfDayUtc();
      const { count: todayBatchCount, error: countErr } = await supabase
        .from('import_batches')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', STORE_ID)
        .gte('created_at', startOfDayUtc);

      if (!countErr && (todayBatchCount ?? 0) >= 60) {
        return NextResponse.json(
          { error: '오늘 가져오기 횟수를 모두 썼어요. 내일 다시 해 주세요.' },
          { status: 400 }
        );
      }

      // B-2 & C-8: 등록할 날짜(신규 빈 날짜 + 0원 채우기)가 0이면 batch 미생성 및 거부
      const totalAvailableDays = daysToInsert + (fillZeroSales ? daysToFillZero : 0);
      if (totalAvailableDays === 0) {
        if (isAlreadyImported) {
          return NextResponse.json({ error: '이미 가져온 달입니다. 등록할 빈 날짜가 없습니다.' }, { status: 400 });
        }
        return NextResponse.json({ error: '등록할 빈 날짜가 없습니다.' }, { status: 400 });
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
          mode: 'fill',
          created_by: user.id,
          updated_zero_sales: [],
        })
        .select('*')
        .single();

      if (batchErr || !batchData) {
        throw new Error(batchErr?.message || '배치 레코드 생성 실패');
      }

      const batchId = batchData.id;
      let totalDaysWritten = 0;
      let zeroDaysFilledCount = 0;
      let skippedDaysCount = 0;
      let totalMenuRowsWritten = 0;
      const updatedZeroSalesList: Array<{
        id: string;
        date: string;
        original: Record<string, any>;
      }> = [];

      try {
        // 일자별 처리
        for (const ds of parsed.daySummaries ?? []) {
          if (ds.isFutureDate || ds.isZeroRevenue) continue;

          let dailySaleId: string;
          const exists = existingSalesMap.has(ds.date);

          if (exists) {
            const existingSale = existingSalesMap.get(ds.date)!;
            const isZeroEligible = fillZeroSales && zeroSalesDaysMap.has(ds.date);

            if (!isZeroEligible) {
              // 0원 채우기 대상이 아니면 건너뜀
              skippedDaysCount++;
              continue;
            }

            // C-8 (2): 저장 시 경쟁 상태 방지 - 메뉴 행 0건 재확인
            const { count: currentMenuCount } = await supabase
              .from('sales_menu_items')
              .select('*', { count: 'exact', head: true })
              .eq('daily_sale_id', existingSale.id);

            if ((currentMenuCount ?? 0) > 0) {
              skippedDaysCount++;
              continue;
            }

            // 원본 전체 스냅샷 저장
            const originalSnapshot = {
              total_revenue: existingSale.total_revenue,
              actual_sales: existingSale.actual_sales,
              net_revenue: existingSale.net_revenue,
              tax: existingSale.tax,
              discount: existingSale.discount,
              service_charge: existingSale.service_charge,
              service_amount: existingSale.service_amount,
              cash_count: existingSale.cash_count,
              cash_amount: existingSale.cash_amount,
              card_count: existingSale.card_count,
              card_amount: existingSale.card_amount,
              tables_used: existingSale.tables_used,
              guest_count: existingSale.guest_count,
              avg_spend: existingSale.avg_spend,
              input_method: existingSale.input_method,
              import_batch_id: existingSale.import_batch_id,
            };

            // UPDATE 실행 (WHERE id = ? AND store_id = ? AND net_revenue = 0)
            const { data: updSaleData, error: updSaleErr } = await supabase
              .from('daily_sales')
              .update({
                total_revenue: ds.totalAmount,
                actual_sales: ds.totalAmount,
                net_revenue: ds.netRevenue,
                tax: ds.tax,
                discount: 0,
                service_charge: 0,
                service_amount: 0,
                cash_count: 0,
                cash_amount: 0,
                card_count: 0,
                card_amount: 0,
                tables_used: 0,
                guest_count: 0,
                avg_spend: 0,
                input_method: 'excel_upload',
                import_batch_id: batchId,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingSale.id)
              .eq('store_id', STORE_ID)
              .eq('net_revenue', 0)
              .select('id');

            if (updSaleErr || !updSaleData || updSaleData.length === 0) {
              skippedDaysCount++;
              continue;
            }

            dailySaleId = existingSale.id;
            updatedZeroSalesList.push({
              id: existingSale.id,
              date: ds.date,
              original: originalSnapshot,
            });
            zeroDaysFilledCount++;
          } else {
            // 신규 INSERT
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

            if (saleErr) {
              // C-2: unique 위반(23505)은 실패가 아니라 건너뛰기로 처리
              if (
                saleErr.code === '23505' ||
                saleErr.message?.includes('duplicate key') ||
                saleErr.message?.includes('unique constraint')
              ) {
                skippedDaysCount++;
                continue;
              }
              throw saleErr;
            }

            dailySaleId = saleData.id;
            totalDaysWritten++;
          }

          // 해당 일자의 메뉴 항목 수집 및 등록
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
            for (let i = 0; i < dayMenuItems.length; i += 100) {
              const chunk = dayMenuItems.slice(i, i + 100);
              const { error: miErr } = await supabase.from('sales_menu_items').insert(chunk);
              if (miErr) throw miErr;
            }
            totalMenuRowsWritten += dayMenuItems.length;
          }
        }

        // C-3: days_written 갱신 쿼리에 store_id 조건 + 오류 확인
        const { error: updBatchErr } = await supabase
          .from('import_batches')
          .update({
            days_written: totalDaysWritten + zeroDaysFilledCount,
            menu_rows: totalMenuRowsWritten,
            updated_zero_sales: updatedZeroSalesList,
          })
          .eq('store_id', STORE_ID)
          .eq('id', batchId);

        if (updBatchErr) throw updBatchErr;

        return NextResponse.json({
          ok: true,
          batchId,
          daysWritten: totalDaysWritten,
          zeroDaysFilled: zeroDaysFilledCount,
          skippedDays: skippedDaysCount,
          menuRowsWritten: totalMenuRowsWritten,
          message: `${yearMonth} 가져오기 완료: 신규 ${totalDaysWritten}일, 0원 채움 ${zeroDaysFilledCount}일 (건너뜀 ${skippedDaysCount}일)`,
        });
      } catch (saveError) {
        // C-8 (3) & C-3: 롤백 순서
        console.error('OKPOS 가져오기 중 오류 발생, 롤백 수행:', saveError);
        // ① updated_zero_sales 복원: 메뉴 삭제 후 스냅샷 복원
        for (const item of updatedZeroSalesList) {
          try {
            await supabase
              .from('sales_menu_items')
              .delete()
              .eq('daily_sale_id', item.id)
              .eq('import_batch_id', batchId);
            await supabase
              .from('daily_sales')
              .update({
                ...item.original,
                updated_at: new Date().toISOString(),
              })
              .eq('store_id', STORE_ID)
              .eq('id', item.id);
          } catch (rErr) {
            console.error('롤백 중 0원 날 복원 실패:', rErr);
          }
        }

        // ② 신규 행 삭제
        const updatedIds = updatedZeroSalesList.map((z) => z.id);
        let delQuery = supabase
          .from('daily_sales')
          .delete()
          .eq('store_id', STORE_ID)
          .eq('import_batch_id', batchId);
        if (updatedIds.length > 0) {
          delQuery = delQuery.not('id', 'in', `(${updatedIds.join(',')})`);
        }
        const { error: delErr } = await delQuery;
        if (delErr) {
          console.error('롤백 중 daily_sales 삭제 실패:', delErr);
        } else {
          // daily_sales 삭제가 성공했을 때만 import_batches 행 삭제
          await supabase.from('import_batches').delete().eq('store_id', STORE_ID).eq('id', batchId);
        }
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
      return NextResponse.json({ error: '취소할 묶음 ID가 필요합니다.' }, { status: 400 });
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

    // C-8 (3): 취소 순서 (매우 중요)
    const updatedZeroSales: Array<{ id: string; date: string; original: Record<string, any> }> =
      batch.updated_zero_sales || [];

    // ① updated_zero_sales 의 행들: 그 날 sales_menu_items 중 import_batch_id = batchId 인 행 삭제
    // -> daily_sales 를 스냅샷으로 복원 (import_batch_id 도 원래 값=null 로)
    for (const item of updatedZeroSales) {
      const { error: delMenuErr } = await supabase
        .from('sales_menu_items')
        .delete()
        .eq('daily_sale_id', item.id)
        .eq('import_batch_id', batchId);

      if (delMenuErr) {
        throw new Error(`0원 날 메뉴 복원 중 오류가 발생했습니다: ${delMenuErr.message}`);
      }

      const { error: restoreErr } = await supabase
        .from('daily_sales')
        .update({
          ...item.original,
          updated_at: new Date().toISOString(),
        })
        .eq('store_id', STORE_ID)
        .eq('id', item.id);

      if (restoreErr) {
        throw new Error(`0원 날 매출 복원 중 오류가 발생했습니다: ${restoreErr.message}`);
      }
    }

    // ② 그 다음에만 신규 행 삭제
    // ①이 하나라도 실패하면 ②를 실행하지 않고 undone_at 도 기록하지 않고 throw 됨
    const updatedIds = updatedZeroSales.map((z) => z.id);
    let delNewQuery = supabase
      .from('daily_sales')
      .delete()
      .eq('store_id', STORE_ID)
      .eq('import_batch_id', batchId);

    if (updatedIds.length > 0) {
      delNewQuery = delNewQuery.not('id', 'in', `(${updatedIds.join(',')})`);
    }

    const { error: delNewErr } = await delNewQuery;
    if (delNewErr) {
      throw new Error(`신규 등록 매출 삭제 중 오류가 발생했습니다: ${delNewErr.message}`);
    }

    // import_batches에 undone_at 기록
    const { error: updErr } = await supabase
      .from('import_batches')
      .update({ undone_at: new Date().toISOString() })
      .eq('store_id', STORE_ID)
      .eq('id', batchId);

    if (updErr) throw updErr;

    return NextResponse.json({
      ok: true,
      message: `${batch.year_month} 가져오기가 취소되었습니다. (신규 매출 삭제 및 0원 날 복원 완료)`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '가져오기 취소 중 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
