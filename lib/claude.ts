const anthropicKey = process.env.ANTHROPIC_API_KEY;
const useMock = !anthropicKey;

const sampleSalesResponse = JSON.stringify({
  storeName: '설맥(현리점)',
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
    { name: '설맥치킨', quantity: 1, amount: 18900 },
    { name: '손살양념치킨', quantity: 1, amount: 10900 },
    { name: '고르곤졸라피자', quantity: 1, amount: 13900 }
  ]
});

const sampleMenuResponse = JSON.stringify({
  date: '2026-05-11',
  menuItems: [
    { name: '설맥치킨', quantity: 1, amount: 18900 },
    { name: '손살양념치킨', quantity: 1, amount: 10900 },
    { name: '고르곤졸라피자', quantity: 1, amount: 13900 }
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
    const trimmed = content.trim();
    const jsonStart = trimmed.indexOf('{');
    const jsonEnd = trimmed.lastIndexOf('}');

    if (jsonStart >= 0 && jsonEnd >= jsonStart) {
      return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
    }

    return JSON.parse(trimmed) as T;
  } catch (error) {
    throw new Error('Claude 응답을 JSON으로 파싱할 수 없습니다.');
  }
}
