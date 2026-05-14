import { PurchaseRecord } from '../../types/purchase';
import { parseClaudeJson } from '../claude';

function fixYear(dateStr: string): string {
  const currentYear = new Date().getFullYear().toString();
  const m = dateStr.match(/^(\d{4})/);
  if (m && m[1] !== currentYear) return dateStr.replace(/^\d{4}/, currentYear);
  return dateStr;
}

export function parsePurchaseResponse(rawText: string): PurchaseRecord {
  const parsed = parseClaudeJson<Record<string, unknown>>(rawText);

  return {
    date: fixYear(String(parsed.date ?? '')),
    vendorName: String(parsed.vendorName ?? ''),
    totalAmount: Number(parsed.totalAmount ?? 0),
    taxAmount: Number(parsed.taxAmount ?? 0),
    netAmount: Number(parsed.netAmount ?? 0),
    category: String(parsed.category ?? 'other') as PurchaseRecord['category'],
    items: Array.isArray(parsed.items)
      ? parsed.items.map((item) => ({
          name: String((item as any).name ?? ''),
          quantity: Number((item as any).quantity ?? 0),
          unitPrice: Number((item as any).unitPrice ?? 0),
          amount: Number((item as any).amount ?? 0),
        }))
      : [],
    inputMethod: 'receipt_photo',
  };
}
