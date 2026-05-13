import { NextResponse } from 'next/server';
import { callClaudeVision } from '../../../../lib/claude';
import { parseMenuSalesResponse } from '../../../../lib/parsers/menuSales';

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const imageUrl = payload?.imageUrl;
  const images = payload?.images;

  if (!imageUrl && (!Array.isArray(images) || images.length === 0)) {
    return NextResponse.json({ error: 'imageUrl 또는 images를 전달해야 합니다.' }, { status: 400 });
  }

  const prompt = `한국 식당 POS의 메뉴별 매출 내역 이미지를 JSON 배열로 추출해주세요. date, menuItems(name, quantity, amount)를 포함하세요.`;
  const raw = await callClaudeVision(prompt);
  const parsed = parseMenuSalesResponse(raw);

  return NextResponse.json({ data: parsed });
}
