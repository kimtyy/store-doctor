import { SalesMenuItem } from '../../types/sales';
import { parseClaudeJson } from '../claude';

export function parseMenuSalesResponse(rawText: string): { date?: string; menuItems: SalesMenuItem[] } {
  const parsed = parseClaudeJson<Record<string, unknown>>(rawText);

  return {
    date: parsed.date ? String(parsed.date) : undefined,
    menuItems: Array.isArray(parsed.menuItems)
      ? parsed.menuItems.map((item) => ({
          name: String((item as any).name ?? ''),
          quantity: Number((item as any).quantity ?? 0),
          amount: Number((item as any).amount ?? 0),
        }))
      : [],
  };
}
