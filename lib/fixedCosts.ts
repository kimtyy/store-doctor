import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export interface ApplyResult {
  storeId: string;
  appliedCount: number;
  skippedCount: number;
  errorCount: number;
  details: Array<{
    fixedCostName: string;
    yearMonth: string;
    status: 'applied' | 'skipped' | 'error';
    message?: string;
  }>;
}

/**
 * Generates an array of YYYY-MM strings between startYearMonth and endYearMonth (inclusive).
 */
function getYearMonthRange(startYM: string, endYM: string): string[] {
  const result: string[] = [];
  const [startYear, startMonth] = startYM.split('-').map(Number);
  const [endYear, endMonth] = endYM.split('-').map(Number);

  let currentYear = startYear;
  let currentMonth = startMonth;

  while (
    currentYear < endYear ||
    (currentYear === endYear && currentMonth <= endMonth)
  ) {
    const ym = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    result.push(ym);

    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }

  return result;
}

/**
 * Applies active fixed costs for a specific store for all missing months
 * from either creation date month or August 2026 (whichever is earlier/relevant) up to current month.
 */
export async function applyFixedCostsForStore(
  storeId: string,
  executionType: 'cron' | 'on_demand' | 'manual' = 'on_demand'
): Promise<ApplyResult> {
  const supabase = getAdminClient();
  const result: ApplyResult = {
    storeId,
    appliedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    details: [],
  };

  if (!supabase) {
    console.error('FixedCosts: Supabase admin client configuration missing');
    return result;
  }

  try {
    const now = new Date();
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Get active fixed costs for the store
    const { data: fixedCosts, error: fcError } = await supabase
      .from('fixed_costs')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true);

    if (fcError) {
      console.error(`FixedCosts: Error fetching fixed costs for store ${storeId}:`, fcError.message);
      return result;
    }

    if (!fixedCosts || fixedCosts.length === 0) {
      return result;
    }

    // Get existing auto_fixed purchase records for the store
    const { data: existingRecords, error: exError } = await supabase
      .from('purchase_records')
      .select('id, note')
      .eq('store_id', storeId)
      .eq('input_method', 'auto_fixed')
      .like('note', 'fixed:%');

    if (exError) {
      console.error(`FixedCosts: Error fetching existing purchase records for store ${storeId}:`, exError.message);
      return result;
    }

    // Set of existing notes, e.g. "fixed:2026-08:<fixed_cost_id>"
    const existingNoteSet = new Set((existingRecords ?? []).map((r) => r.note));

    for (const fc of fixedCosts) {
      // Determine starting month for this fixed cost
      let startYM = '2026-08'; // Default backfill starting month
      if (fc.created_at) {
        const createdDate = new Date(fc.created_at);
        const createdYM = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}`;
        if (createdYM < startYM) {
          startYM = createdYM;
        }
      }

      const monthsToProcess = getYearMonthRange(startYM, currentYM);

      for (const yearMonth of monthsToProcess) {
        const noteKey = `fixed:${yearMonth}:${fc.id}`;

        if (existingNoteSet.has(noteKey)) {
          result.skippedCount++;
          result.details.push({
            fixedCostName: fc.name,
            yearMonth,
            status: 'skipped',
            message: '이미 매입 내역에 존재합니다.',
          });
          continue;
        }

        // Create purchase record
        const firstOfMonth = `${yearMonth}-01`;
        const totalAmount = fc.cost_type === 'manual_input' ? 0 : fc.amount;

        const { data: inserted, error: insertError } = await supabase
          .from('purchase_records')
          .insert({
            store_id: storeId,
            date: firstOfMonth,
            vendor_name: fc.name,
            total_amount: totalAmount,
            tax_amount: 0,
            net_amount: totalAmount,
            category: fc.category,
            items: [],
            input_method: 'auto_fixed',
            note: noteKey,
          })
          .select('id')
          .single();

        if (insertError) {
          result.errorCount++;
          result.details.push({
            fixedCostName: fc.name,
            yearMonth,
            status: 'error',
            message: insertError.message,
          });

          // Log failure to fixed_cost_execution_logs if log table exists
          try {
            await supabase.from('fixed_cost_execution_logs').insert({
              store_id: storeId,
              fixed_cost_id: fc.id,
              year_month: yearMonth,
              status: 'error',
              execution_type: executionType,
              error_message: insertError.message,
            });
          } catch (_) {}
        } else {
          result.appliedCount++;
          existingNoteSet.add(noteKey);
          result.details.push({
            fixedCostName: fc.name,
            yearMonth,
            status: 'applied',
          });

          // Log success to fixed_cost_execution_logs
          try {
            await supabase.from('fixed_cost_execution_logs').insert({
              store_id: storeId,
              fixed_cost_id: fc.id,
              purchase_record_id: inserted?.id ?? null,
              year_month: yearMonth,
              status: 'applied',
              execution_type: executionType,
            });
          } catch (_) {}
        }
      }
    }
  } catch (err) {
    console.error(`FixedCosts: Unexpected error applying fixed costs for store ${storeId}:`, err);
  }

  return result;
}

/**
 * Applies active fixed costs for ALL stores in the database.
 * Used primarily by cron jobs.
 */
export async function applyFixedCostsForAllStores(
  executionType: 'cron' | 'on_demand' | 'manual' = 'cron'
): Promise<ApplyResult[]> {
  const supabase = getAdminClient();
  if (!supabase) return [];

  const { data: stores, error } = await supabase.from('stores').select('id');
  if (error || !stores) {
    console.error('FixedCosts: Error fetching all stores for cron:', error?.message);
    return [];
  }

  const results: ApplyResult[] = [];
  for (const store of stores) {
    const res = await applyFixedCostsForStore(store.id, executionType);
    results.push(res);
  }

  return results;
}
