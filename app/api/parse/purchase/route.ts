import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { callClaudeVision } from '../../../../lib/claude';
import { parsePurchaseResponse } from '../../../../lib/parsers/purchase';
import { getStoreId } from '@/utils/supabase/getStore';



function makeSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Simple Levenshtein distance
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Returns canonical vendor name if OCR name matches an alias or canonical (exact or near)
function correctVendorName(
  ocrName: string,
  master: { vendor_name: string; aliases: string[] }[]
): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '');
  const target = norm(ocrName);
  if (!target) return ocrName;

  // 1. Exact match against canonical names and aliases
  for (const entry of master) {
    if (norm(entry.vendor_name) === target) return entry.vendor_name;
    for (const alias of entry.aliases ?? []) {
      if (norm(alias) === target) return entry.vendor_name;
    }
  }

  // 2. Levenshtein fuzzy match (threshold: ≤ 2 edits for short strings, ≤ 3 for longer)
  const threshold = ocrName.length <= 6 ? 2 : 3;
  let bestDist = threshold + 1;
  let bestCanonical = ocrName;

  for (const entry of master) {
    const candidates = [entry.vendor_name, ...(entry.aliases ?? [])];
    for (const candidate of candidates) {
      const dist = levenshtein(target, norm(candidate));
      if (dist < bestDist) {
        bestDist = dist;
        bestCanonical = entry.vendor_name;
      }
    }
  }

  return bestCanonical;
}

function similarity(a: string, b: string): number {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '');
  const na = norm(a);
  const nb = norm(b);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}


export async function POST(request: Request) {
  const STORE_ID = await getStoreId();
  if (!STORE_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const payload = await request.json().catch(() => null);
    const imageUrl = payload?.imageUrl;
    const images = payload?.images;

    if (!imageUrl && (!Array.isArray(images) || images.length === 0)) {
      return NextResponse.json({ error: 'imageUrl 또는 images를 전달해야 합니다.' }, { status: 400 });
    }

    const prompt = `이미지는 한국 식자재·주류·소모품 납품 영수증 또는 구매 영수증입니다.
아래 JSON 형식만 출력하세요. 마크다운, 설명, 코드블럭 없이 순수 JSON만:

{
  "date": "YYYY-MM-DD",
  "vendorName": "공급업체 또는 상호명",
  "totalAmount": 합계금액(숫자),
  "taxAmount": 부가세(숫자, 없으면 0),
  "netAmount": 공급가액(숫자, 없으면 totalAmount와 동일),
  "category": "food_ingredients | alcohol | consumables | other 중 하나",
  "items": [
    { "name": "품목명", "quantity": 수량, "unitPrice": 단가, "amount": 금액 }
  ]
}

카테고리 기준:
- alcohol: 맥주·소주·와인·막걸리 등 주류
- food_ingredients: 식재료·식자재·농산물·수산물·육류
- consumables: 포장재·냅킨·일회용품 등 소모품
- other: 그 외

주의사항:
- 날짜가 안 보이면 오늘 날짜 사용
- 부가세가 별도 명시된 경우만 taxAmount에 입력, 없으면 0
- 품목이 없으면 items를 빈 배열 []로`;

    const raw = await callClaudeVision(prompt, images ?? (imageUrl ? [imageUrl] : undefined));
    const parsed = parsePurchaseResponse(raw);

    // Apply vendor name correction from vendor_master
    const supabase = makeSupabase();
    let vendorCorrected = false;
    if (supabase && parsed.vendorName) {
      const { data: masterData } = await supabase
        .from('vendor_master')
        .select('vendor_name, aliases')
        .eq('store_id', STORE_ID);

      if (masterData && masterData.length > 0) {
        const originalVendorName = parsed.vendorName;
        const corrected = correctVendorName(originalVendorName, masterData);
        if (corrected !== originalVendorName) {
          parsed.vendorName = corrected;
          vendorCorrected = true;
        }
      }
    }
    parsed.vendorCorrected = vendorCorrected;

    // Apply item name correction from historical records
    if (supabase && parsed.items && parsed.items.length > 0) {
      const { data: recentRecords } = await supabase
        .from('purchase_records')
        .select('items')
        .eq('store_id', STORE_ID)
        .order('date', { ascending: false })
        .limit(100);

      const knownItems = new Set<string>();
      if (recentRecords) {
        for (const rec of recentRecords) {
          const items = (rec.items ?? []) as { name?: string }[];
          for (const item of items) {
            const name = item.name?.trim();
            if (name) knownItems.add(name);
          }
        }
      }

      if (knownItems.size > 0) {
        parsed.items = parsed.items.map((item: any) => {
          const ocrName = item.name;
          if (!ocrName) return item;
          let bestMatch = ocrName;
          let bestSim = 0.8; // similarity threshold 80%
          for (const known of knownItems) {
            const sim = similarity(ocrName, known);
            if (sim > bestSim) {
              bestSim = sim;
              bestMatch = known;
            }
          }
          return {
            ...item,
            name: bestMatch,
            _originalName: bestMatch !== ocrName ? ocrName : undefined,
            _corrected: bestMatch !== ocrName,
          };
        });
      }
    }

    return NextResponse.json({ data: parsed });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '파싱 중 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
