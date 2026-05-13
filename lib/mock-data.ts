import { DailySales } from '@/types/sales';
import { PurchaseRecord } from '@/types/purchase';

function generateRandomVariation(base: number, variance: number): number {
  return base + (Math.random() - 0.5) * variance;
}

export function generateMockDailySalesData(days: number = 120): DailySales[] {
  const result: DailySales[] = [];
  const baseRevenue = 380000; // 일평균 매출
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const dailyVariation = generateRandomVariation(baseRevenue, baseRevenue * 0.3); // ±30% 변동
    const revenue = Math.max(100000, Math.round(dailyVariation));
    const tax = Math.round(revenue * 0.091);
    const netRevenue = revenue - tax;

    const cashRatio = Math.random() * 0.2 + 0.5; // 50~70% 현금
    const cashAmount = Math.round(netRevenue * cashRatio);
    const cardAmount = netRevenue - cashAmount;

    result.push({
      date: dateStr,
      totalRevenue: revenue,
      discount: 0,
      serviceCharge: 0,
      serviceAmount: 0,
      actualSales: revenue,
      tax,
      netRevenue,
      cashCount: Math.floor(Math.random() * 5) + 3,
      cashAmount,
      cardCount: Math.floor(Math.random() * 3) + 1,
      cardAmount,
      tablesUsed: Math.floor(Math.random() * 10) + 4,
      guestCount: Math.floor(Math.random() * 15) + 8,
      avgSpend: Math.round(revenue / (Math.floor(Math.random() * 15) + 8)),
      openTime: '18:00',
      closeTime: '23:30',
      firstOrderTime: '18:45',
      inputMethod: 'manual',
      menuItems: generateMockMenuItems(revenue),
    });
  }

  return result;
}

function generateMockMenuItems(totalRevenue: number) {
  const items = [
    { name: '설맥치킨', ratio: 0.15 },
    { name: '생맥주(테라)', ratio: 0.25 },
    { name: '생맥주(카스)', ratio: 0.2 },
    { name: '골뱅이무침', ratio: 0.1 },
    { name: '과일빙수', ratio: 0.12 },
    { name: '기타 음식', ratio: 0.18 },
  ];

  return items.map((item) => ({
    name: item.name,
    quantity: Math.floor(Math.random() * 5) + 1,
    amount: Math.round(totalRevenue * item.ratio),
  }));
}

export function generateMockPurchaseData(days: number = 120): PurchaseRecord[] {
  const result: PurchaseRecord[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    // 주 3회 정도 매입 기록
    if (Math.random() < 0.3) {
      const categories: PurchaseRecord['category'][] = [
        'food_ingredients',
        'alcohol',
        'consumables',
      ];
      const category = categories[Math.floor(Math.random() * categories.length)];
      const amount = Math.round(generateRandomVariation(80000, 40000));

      result.push({
        date: dateStr,
        vendorName:
          category === 'food_ingredients'
            ? '홈플러스'
            : category === 'alcohol'
              ? '주류 도매상'
              : '편의점',
        totalAmount: amount,
        taxAmount: Math.round(amount * 0.1),
        netAmount: Math.round(amount * 0.9),
        category,
        items: [
          {
            name: '샘플 품목',
            quantity: 1,
            unitPrice: amount,
            amount,
          },
        ],
        inputMethod: 'manual',
        note: '정기 매입',
      });
    }
  }

  return result;
}

export const mockSalesData = generateMockDailySalesData(120);
export const mockPurchaseData = generateMockPurchaseData(120);

export function getTodayMockData() {
  const today = new Date().toISOString().split('T')[0];
  return {
    sales: mockSalesData[mockSalesData.length - 1],
    purchases: mockPurchaseData.filter((p) => p.date === today),
  };
}
