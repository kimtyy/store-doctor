import { NextResponse } from 'next/server';
import { callClaudeVision } from '../../../../lib/claude';
import { parsePurchaseResponse } from '../../../../lib/parsers/purchase';

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const imageUrl = payload?.imageUrl;
  const images = payload?.images;

  if (!imageUrl && (!Array.isArray(images) || images.length === 0)) {
    return NextResponse.json({ error: 'imageUrl 또는 images를 전달해야 합니다.' }, { status: 400 });
  }

  const prompt = `한국 식당 매입 영수증 이미지를 JSON으로 추출해주세요: date, vendorName, totalAmount, taxAmount, netAmount, category, items(name, quantity, unitPrice, amount).`;
  const raw = await callClaudeVision(prompt, images ?? (imageUrl ? [imageUrl] : undefined));
  const parsed = parsePurchaseResponse(raw);

  return NextResponse.json({ data: parsed });
}
