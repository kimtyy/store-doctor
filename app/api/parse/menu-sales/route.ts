import { NextResponse } from 'next/server';
import { callClaudeVision } from '../../../../lib/claude';
import { parseMenuSalesResponse } from '../../../../lib/parsers/menuSales';

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => null);

    if (!payload) {
      return NextResponse.json({
        error: '요청 본문을 파싱할 수 없습니다. 올바른 JSON 형식을 사용해주세요.'
      }, { status: 400 });
    }

    const imageUrl = payload?.imageUrl;
    const images = payload?.images;

    if (!imageUrl && (!Array.isArray(images) || images.length === 0)) {
      return NextResponse.json({
        error: 'imageUrl 또는 images 배열을 전달해야 합니다.'
      }, { status: 400 });
    }

    const prompt = `한국 식당 POS의 메뉴별 매출 내역 이미지를 분석해서 다음 JSON 형식으로 추출해주세요:

{
  "date": "2026-05-11",
  "menuItems": [
    {"name": "설맥치킨", "quantity": 1, "amount": 18900},
    {"name": "손살양념치킨", "quantity": 1, "amount": 10900}
  ]
}

주의사항:
- 메뉴명은 정확히 추출
- 수량과 금액은 숫자로만 (쉼표 제거)
- 날짜는 YYYY-MM-DD 형식
- 모든 메뉴 항목을 빠짐없이 포함`;

    const raw = await callClaudeVision(prompt, images);

    if (!raw || raw.trim() === '') {
      return NextResponse.json({
        error: 'Claude Vision API로부터 응답을 받지 못했습니다. 잠시 후 다시 시도해주세요.'
      }, { status: 502 });
    }

    const parsed = parseMenuSalesResponse(raw);

    const STORE_ID = '8de2930d-a196-4aa1-b9bf-7fa83321b10c';
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseServiceKey && parsed.menuItems) {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: masters } = await supabase
        .from('menu_master')
        .select('menu_name, aliases, category')
        .eq('store_id', STORE_ID);

      if (masters && masters.length > 0) {
        const { correctMenuName } = await import('../../../../lib/menuCorrection');
        parsed.menuItems = parsed.menuItems.map((item: any) => {
          const res = correctMenuName(
            item.name,
            masters.map((m) => ({
              menuName: m.menu_name,
              aliases: m.aliases ?? [],
              category: m.category,
            }))
          );

          if (res.status === 'exact' || res.status === 'auto') {
            return {
              ...item,
              name: res.correctedName,
              category: res.category ?? undefined,
              _originalName: res.originalName,
              _correctionStatus: res.status,
            };
          } else if (res.status === 'suggest') {
            return {
              ...item,
              _originalName: item.name,
              _correctionStatus: 'suggest',
              _suggestedName: res.suggestedName,
            };
          } else {
            // < 60%
            return {
              ...item,
              name: `[신규] ${item.name}`,
              _originalName: item.name,
              _correctionStatus: 'new',
            };
          }
        });
      }
    }

    return NextResponse.json({ data: parsed });

  } catch (error) {
    console.error('Menu sales parsing error:', error);

    if (error instanceof Error) {
      // Claude API 관련 에러
      if (error.message.includes('Claude API')) {
        return NextResponse.json({
          error: `AI 파싱 서비스 오류: ${error.message}`
        }, { status: 502 });
      }

      // JSON 파싱 에러
      if (error.message.includes('JSON')) {
        return NextResponse.json({
          error: 'AI 응답을 처리할 수 없습니다. 다른 사진으로 다시 시도해주세요.'
        }, { status: 422 });
      }

      // 기타 에러
      return NextResponse.json({
        error: error.message
      }, { status: 500 });
    }

    return NextResponse.json({
      error: '알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
    }, { status: 500 });
  }
}
