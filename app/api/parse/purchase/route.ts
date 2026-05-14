import { NextResponse } from 'next/server';
import { callClaudeVision } from '../../../../lib/claude';
import { parsePurchaseResponse } from '../../../../lib/parsers/purchase';

export async function POST(request: Request) {
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

    return NextResponse.json({ data: parsed });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '파싱 중 오류가 발생했습니다.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
