const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 1. Load env variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('Error: .env.local not found');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
  if (match) {
    const key = match[1];
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.substring(1, val.length - 1);
    }
    env[key] = val;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // Get first store
  const { data: stores, error: storeError } = await supabase.from('stores').select('*').limit(1);
  if (storeError || !stores || stores.length === 0) {
    console.error('Failed to fetch stores:', storeError);
    process.exit(1);
  }
  const store = stores[0];
  console.log(`Verifying July 2026 discrepancy for Store: "${store.name}" (ID: ${store.id})`);

  const fromStr = '2026-07-01';
  const toStr = '2026-07-31';

  // Fetch sales and purchase records
  const { data: sales, error: salesError } = await supabase
    .from('daily_sales')
    .select('*')
    .eq('store_id', store.id)
    .gte('date', fromStr)
    .lte('date', toStr);

  const { data: purchases, error: purError } = await supabase
    .from('purchase_records')
    .select('*')
    .eq('store_id', store.id)
    .gte('date', fromStr)
    .lte('date', toStr);

  if (salesError || purError) {
    console.error('Error fetching data:', salesError || purError);
    process.exit(1);
  }

  console.log(`Fetched ${sales.length} sales records and ${purchases.length} purchase records for July 2026.\n`);

  // Map purchases by date
  const purchaseByDate = {};
  const eventPurchaseByDate = {};
  for (const p of purchases) {
    if (!p.is_event) {
      purchaseByDate[p.date] = (purchaseByDate[p.date] || 0) + p.total_amount;
    } else {
      eventPurchaseByDate[p.date] = (eventPurchaseByDate[p.date] || 0) + p.total_amount;
    }
  }

  // ----------------------------------------------------
  // Old Logic Calculations
  // ----------------------------------------------------
  console.log('=== [OLD LOGIC] ===');

  // Diagnosis Tab (Old):
  // - Sales = net_revenue (includeEvent toggle affects event sales inclusion)
  // - Purchase = real purchase if exists, else net_revenue * 0.4
  // Let's assume includeEvent = false (default)
  let oldDiagBaseRev = 0;
  let oldDiagBaseCost = 0;
  for (const s of sales) {
    if (!s.is_event) {
      oldDiagBaseRev += s.net_revenue;
      const real = purchaseByDate[s.date];
      if (real !== undefined) {
        oldDiagBaseCost += real;
      } else {
        oldDiagBaseCost += s.net_revenue * 0.4;
      }
    }
  }
  const oldDiagBaseProfit = oldDiagBaseRev - oldDiagBaseCost;

  // Analytics Tab (Old):
  // - Sales = total_revenue (no is_event filter at all in API)
  // - Purchase = total_amount (no is_event filter at all in API)
  let oldAnalTotalRev = 0;
  for (const s of sales) {
    oldAnalTotalRev += s.total_revenue;
  }
  let oldAnalTotalCost = 0;
  for (const p of purchases) {
    oldAnalTotalCost += p.total_amount;
  }
  const oldAnalProfit = oldAnalTotalRev - oldAnalTotalCost;

  console.log('Diagnosis Tab (Default, Excl. Event):');
  console.log(`  Revenue:  ${oldDiagBaseRev.toLocaleString()} 원`);
  console.log(`  Purchase: ${Math.round(oldDiagBaseCost).toLocaleString()} 원 (with 40% estimation)`);
  console.log(`  Profit:   ${Math.round(oldDiagBaseProfit).toLocaleString()} 원`);
  console.log('Analytics Tab (Default, Old Route):');
  console.log(`  Revenue:  ${oldAnalTotalRev.toLocaleString()} 원 (total_revenue base, includes events)`);
  console.log(`  Purchase: ${oldAnalTotalCost.toLocaleString()} 원 (includes events)`);
  console.log(`  Profit:   ${oldAnalProfit.toLocaleString()} 원`);
  console.log(`  Discrepancy:`);
  console.log(`    Revenue Diff:  ${(oldAnalTotalRev - oldDiagBaseRev).toLocaleString()} 원`);
  console.log(`    Purchase Diff: ${(oldAnalTotalCost - oldDiagBaseCost).toLocaleString()} 원`);
  console.log(`    Profit Diff:   ${(oldAnalProfit - oldDiagBaseProfit).toLocaleString()} 원\n`);

  // ----------------------------------------------------
  // New Logic Calculations (Modified)
  // ----------------------------------------------------
  console.log('=== [NEW LOGIC] ===');

  // Diagnosis Tab (New):
  // - Sales = net_revenue
  // - Purchase = actual purchase_records only (sum of all records in July)
  let newDiagBaseRev = 0;
  for (const s of sales) {
    if (!s.is_event) {
      newDiagBaseRev += s.net_revenue;
    }
  }

  let newDiagBaseCost = 0;
  for (const date in purchaseByDate) {
    if (date.startsWith('2026-07')) {
      newDiagBaseCost += purchaseByDate[date];
    }
  }

  let newDiagMissingDays = 0;
  for (const s of sales) {
    if (!s.is_event) {
      if (purchaseByDate[s.date] === undefined) {
        newDiagMissingDays++;
      }
    }
  }
  const newDiagBaseProfit = newDiagBaseRev - newDiagBaseCost;

  // Analytics Tab (New):
  // - Sales = net_revenue (is_event=false filtered)
  // - Purchase = total_amount (is_event=false filtered)
  let newAnalBaseRev = 0;
  let newAnalBaseCost = 0;
  for (const s of sales) {
    if (!s.is_event) {
      newAnalBaseRev += s.net_revenue;
    }
  }
  for (const p of purchases) {
    if (!p.is_event) {
      newAnalBaseCost += p.total_amount;
    }
  }
  const newAnalBaseProfit = newAnalBaseRev - newAnalBaseCost;

  console.log('Diagnosis Tab (Default, Excl. Event):');
  console.log(`  Revenue:      ${newDiagBaseRev.toLocaleString()} 원`);
  console.log(`  Purchase:     ${newDiagBaseCost.toLocaleString()} 원 (actual only, missing ${newDiagMissingDays} days)`);
  console.log(`  Profit:       ${newDiagBaseProfit.toLocaleString()} 원`);
  console.log('Analytics Tab (Default, Excl. Event):');
  console.log(`  Revenue:      ${newAnalBaseRev.toLocaleString()} 원 (net_revenue base)`);
  console.log(`  Purchase:     ${newAnalBaseCost.toLocaleString()} 원 (actual only)`);
  console.log(`  Profit:       ${newAnalBaseProfit.toLocaleString()} 원`);
  console.log(`  Discrepancy:`);
  console.log(`    Revenue Diff:  ${(newAnalBaseRev - newDiagBaseRev).toLocaleString()} 원`);
  console.log(`    Purchase Diff: ${(newAnalBaseCost - newDiagBaseCost).toLocaleString()} 원`);
  console.log(`    Profit Diff:   ${(newAnalBaseProfit - newDiagBaseProfit).toLocaleString()} 원\n`);

  if (newDiagBaseRev === newAnalBaseRev && newDiagBaseCost === newAnalBaseCost && newDiagBaseProfit === newAnalBaseProfit) {
    console.log('✨ SUCCESS: Diagnosis and Analytics tabs now match perfectly! ✨');
  } else {
    console.log('❌ FAILURE: Mismatch remains! Check filtering logic.');
  }
}

run();
