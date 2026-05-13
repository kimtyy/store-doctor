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

export async function callClaudeVision(prompt: string) {
  if (useMock) {
    return mockResponseByPrompt(prompt);
  }

  const response = await fetch('https://api.anthropic.com/v1/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey as string,
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4.6',
      prompt,
      max_tokens_to_sample: 1000,
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Claude API request failed: ${response.status} ${body}`);
  }

  const payload = await response.json();
  return payload?.completion ?? payload?.response ?? '';
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
