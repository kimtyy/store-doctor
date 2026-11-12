import { DailySales } from '../../types/sales';
import { parseClaudeJson } from '../claude';

export function parsePosReceiptResponse(rawText: string): DailySales {
  const parsed = parseClaudeJson<Record<string, unknown>>(rawText);

  const totalRevenue = Number(parsed.totalRevenue ?? 0) || 0;
  const serviceAmount = Number(parsed.serviceAmount ?? parsed.serviceCharge ?? 0) || 0;
  const rawTablesUsed = Number(parsed.tablesUsed ?? 0) || 0;
  const rawGuestCount = Number(parsed.guestCount ?? 0) || 0;
  const paymentCount = rawTablesUsed > 0 ? rawTablesUsed : rawGuestCount;
  const resolvedGuestCount = rawGuestCount > 0 ? rawGuestCount : paymentCount;
  const rawAvgSpend = Number(parsed.avgSpend ?? 0) || 0;
  const resolvedAvgSpend =
    rawAvgSpend > 0
      ? rawAvgSpend
      : paymentCount > 0 && totalRevenue > 0
        ? Math.round(totalRevenue / paymentCount)
        : 0;

  return {
    date: String(parsed.date ?? ''),
    totalRevenue,
    discount: Number(parsed.discount ?? 0),
    serviceCharge: serviceAmount,
    serviceAmount,
    actualSales: Number(parsed.actualSales ?? (totalRevenue - serviceAmount)),
    tax: Number(parsed.tax ?? 0),
    netRevenue: Number(parsed.netRevenue ?? 0),
    cashCount: Number(parsed.cashCount ?? 0),
    cashAmount: Number(parsed.cashAmount ?? 0),
    cardCount: Number(parsed.cardCount ?? 0),
    cardAmount: Number(parsed.cardAmount ?? 0),
    tablesUsed: paymentCount,
    guestCount: resolvedGuestCount,
    avgSpend: resolvedAvgSpend,
    openTime: parsed.openTime ? String(parsed.openTime) : undefined,
    closeTime: parsed.closeTime ? String(parsed.closeTime) : undefined,
    firstOrderTime: parsed.firstOrderTime ? String(parsed.firstOrderTime) : undefined,
    inputMethod: 'receipt_photo',
    menuItems: Array.isArray(parsed.menuItems)
      ? parsed.menuItems.map((item) => ({
          name: String((item as any).name ?? ''),
          quantity: Number((item as any).quantity ?? 0),
          amount: Number((item as any).amount ?? 0),
        }))
      : [],
  };
}
