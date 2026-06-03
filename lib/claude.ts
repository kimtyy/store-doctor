const anthropicKey = process.env.ANTHROPIC_API_KEY;
const useMock = !anthropicKey;

const sampleSalesResponse = JSON.stringify({
  storeName: '우리 매장',
  date: '2026-05-11',
  totalRevenue: 224500,
  discount: 0,
  serviceCharge: 0,
  tax: 20407,
  netRevenue: 204093,
  cashCount: 5,
  cashAmount: 131800,
  cardCount: 1,
  cardAmount: 92700,
  tablesUsed: 6,
  guestCount: 6,
  avgSpend: 37416,
  openTime: '18:17',
  closeTime: '00:03',
  firstOrderTime: '21:09',
  menuItems: [
    { name: '메인 메뉴 1', quantity: 1, amount: 18900 },
    { name: '서브 메뉴 1', quantity: 1, amount: 10900 },
    { name: '사이드 메뉴 1', quantity: 1, amount: 13900 }
  ]
});

const sampleMenuResponse = JSON.stringify({
  date: '2026-05-11',
  menuItems: [
    { name: '메인 메뉴 1', quantity: 1, amount: 18900 },
    { name: '서브 메뉴 1', quantity: 1, amount: 10900 },
    { name: '사이드 메뉴 1', quantity: 1, amount: 13900 }
  ]
});

const samplePurchaseResponse = JSON.stringify({
  date: '2026-05-11',
  vendorName: '홈플러스',
  totalAmount: 120000,
  taxAmount: 10909,
  netAmount: 109091,
  category: 'food_ingredients',
  items: [
    { name: '냉장육', quantity: 2, unitPrice: 30000, amount: 60000 },
    { name: '채소', quantity: 1, unitPrice: 20000, amount: 20000 }
  ]
});

export async function callClaudeVision(prompt: string, images?: string[]) {
  if (useMock) {
    return mockResponseByPrompt(prompt);
  }

  try {
    // Claude Vision API를 위한 메시지 구성
    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt
          }
        ]
      }
    ];

    // 이미지가 제공된 경우 추가
    if (images && images.length > 0) {
      const dataUrl = images[0];
      const mediaTypeMatch = dataUrl.match(/^data:(image\/[^;]+);base64,/);
      const mediaType = (mediaTypeMatch?.[1] ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
      const base64Data = dataUrl.replace(/^data:image\/[^;]+;base64,/, '');

      messages[0].content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: base64Data,
        }
      } as any);
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey as string,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        temperature: 0,
        messages: messages
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Claude API 요청 실패: ${response.status}`;

      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error?.message) {
          errorMessage += ` - ${errorData.error.message}`;
        }
      } catch {
        errorMessage += ` - ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (!data.content || data.content.length === 0) {
      throw new Error('Claude API 응답이 비어있습니다.');
    }

    const content = data.content[0]?.text;
    if (!content || content.trim() === '') {
      throw new Error('Claude API 응답 텍스트가 비어있습니다.');
    }

    return content;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('알 수 없는 Claude API 오류가 발생했습니다.');
  }
}

function mockResponseByPrompt(prompt: string) {
  const normalized = prompt.toLowerCase();

  if (normalized.includes('손익분기점') || normalized.includes('bep')) {
    return "손익분기점까지 738,000원 부족합니다. 하루 평균 25,000원 추가 매출이 필요해요. 객단가를 높이거나 테이블 회전율을 높이는 것을 고려해보세요.";
  }

  if (normalized.includes('날씨')) {
    return "맑은 날 매출이 비 오는 날 대비 25% 높습니다. 비 오는 날에는 배달 프로모션을 강화하거나 파전/막걸리 등 특선 메뉴 배너를 노출해 보세요.";
  }

  if (normalized.includes('다음달') || normalized.includes('예측')) {
    return "다음 달은 장마 시작으로 비 오는 날이 잦아 방문객이 줄 수 있습니다. 식자재 발주를 10% 정도 보수적으로 줄이시고, 비 오는 날 특화된 배달 메뉴나 파전/막걸리 프로모션을 준비하여 매출 하락을 방어하세요. 주말 영업 비중이 높으므로 주말에는 아르바이트 인력을 추가 배치하는 것을 권장합니다.";
  }

  if (normalized.includes('보고서') || normalized.includes('진단') || normalized.includes('report')) {
    if (normalized.includes('전월 매출') && normalized.includes('전년동월')) {
      return "전월 및 전년 동월 대비 총매출과 영업이익이 모두 상승하는 뚜렷한 성장 트렌드를 보이고 있습니다. 객단가를 높이는 세트 메뉴 구성을 통해 상승세를 이어가세요.";
    }
    return "이번 달은 메뉴 다변화와 비용 절감을 통해 수익성이 크게 개선된 긍정적인 달입니다. 다음 달에도 이 추세를 유지하세요!";
  }

  if (normalized.includes('menu') || normalized.includes('메뉴')) {
    return sampleMenuResponse;
  }

  if (normalized.includes('purchase') || normalized.includes('영수증') || normalized.includes('매입')) {
    return samplePurchaseResponse;
  }

  return sampleSalesResponse;
}

export function parseClaudeJson<T>(content: string): T {
  try {
    // strip markdown code fences if present
    const stripped = content.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
    const jsonStart = stripped.indexOf('{');
    const jsonEnd = stripped.lastIndexOf('}');

    if (jsonStart >= 0 && jsonEnd >= jsonStart) {
      return JSON.parse(stripped.slice(jsonStart, jsonEnd + 1));
    }

    return JSON.parse(stripped) as T;
  } catch {
    throw new Error('Claude 응답을 JSON으로 파싱할 수 없습니다.');
  }
}
