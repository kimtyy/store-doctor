import { NextResponse } from 'next/server';
import { callClaudeVision } from '../../../../lib/claude';
import { parsePosReceiptResponse } from '../../../../lib/parsers/posReceipt';

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

    const prompt = `한국 식당 POS 마감 정산서 이미지에서 다음 정보를 JSON으로 추출해주세요:

{
  "storeName": "매장명",
  "date": "2026-05-11",
  "totalRevenue": 224500,
  "serviceAmount": 29800,
  "actualSales": 194700,
  "discount": 0,
  "serviceCharge": 29800,
  "tax": 17700,
  "netRevenue": 177000,
  "cashCount": 5,
  "cashAmount": 131800,
  "cardCount": 1,
  "cardAmount": 92700,
  "tablesUsed": 6,
  "guestCount": 6,
  "avgSpend": 37416,
  "openTime": "18:17",
  "closeTime": "00:03",
  "firstOrderTime": "21:09",
  "menuItems": [
    {"name": "메뉴명", "quantity": 1, "amount": 18900}
  ]
}

필드 설명:
- totalRevenue: 총매출금액 (영수증에서 "총매출금액" 또는 "매출합계" 항목)
- serviceAmount: 서비스금액 (무료로 제공된 서비스 금액, 없으면 0)
- actualSales: 매출금액 = 총매출금액 - 서비스금액 (영수증에 "매출금액"으로 표시)
- tax: 부가세
- netRevenue: 순매출금액 = 매출금액 - 부가세

주의사항:
- 모든 금액은 숫자로만 입력 (쉼표 제거)
- 시간은 HH:MM 형식
- 날짜는 YYYY-MM-DD 형식
- 부가세는 절대 자동 계산하지 말고 영수증에 명시된 값만 사용
- menuItems는 정산서에 있는 메뉴들만 포함 (없으면 빈 배열)
- 서비스금액이 없으면 serviceAmount: 0, actualSales = totalRevenue`;

    const raw = await callClaudeVision(prompt, images);

    if (!raw || raw.trim() === '') {
      return NextResponse.json({
        error: 'Claude Vision API로부터 응답을 받지 못했습니다. 잠시 후 다시 시도해주세요.'
      }, { status: 502 });
    }

    const parsed = parsePosReceiptResponse(raw);

    return NextResponse.json({ data: parsed });

  } catch (error) {
    console.error('POS receipt parsing error:', error);

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
