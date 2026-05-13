import { NextResponse } from 'next/server';
import { callClaudeVision } from '../../../../lib/claude';
import { parsePosReceiptResponse } from '../../../../lib/parsers/posReceipt';

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const imageUrl = payload?.imageUrl;
  const images = payload?.images;

  if (!imageUrl && (!Array.isArray(images) || images.length === 0)) {
    return NextResponse.json({ error: 'imageUrl 또는 images를 전달해야 합니다.' }, { status: 400 });
  }

  const prompt = `한국 식당 POS 마감 정산서 이미지에서 다음 정보를 JSON으로 추출해주세요: storeName, date, totalRevenue, discount, serviceCharge, tax, netRevenue, cashCount, cashAmount, cardCount, cardAmount, tablesUsed, guestCount, avgSpend, openTime, closeTime, firstOrderTime, menuItems.`;
  const raw = await callClaudeVision(prompt);
  const parsed = parsePosReceiptResponse(raw);

  return NextResponse.json({ data: parsed });
}
