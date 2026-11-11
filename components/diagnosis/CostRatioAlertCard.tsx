'use client';

import TermTooltip from '@/components/ui/TermTooltip';
import { formatCostRatioAlertSummary } from '@/lib/analytics/costRatio';

export interface CostRatioAlertCardProps {
  ma5: number | null;
  ma60: number | null;
  operatingDaysCount: number;
}

const STYLE_MAP = {
  insufficient: {
    container: 'border-slate-700/80 bg-slate-900/90',
    badge: 'bg-slate-800 text-slate-300',
    icon: '⏳',
    accent: 'text-slate-200',
  },
  normal: {
    container: 'border-emerald-500/30 bg-emerald-950/20',
    badge: 'bg-emerald-500/20 text-emerald-300',
    icon: '✅',
    accent: 'text-emerald-300',
  },
  caution: {
    container: 'border-amber-500/40 bg-amber-950/25',
    badge: 'bg-amber-500/20 text-amber-300',
    icon: '⚠️',
    accent: 'text-amber-300',
  },
  danger: {
    container: 'border-rose-500/45 bg-rose-950/30',
    badge: 'bg-rose-500/20 text-rose-300',
    icon: '🚨',
    accent: 'text-rose-300',
  },
} as const;

export default function CostRatioAlertCard({
  ma5,
  ma60,
  operatingDaysCount,
}: CostRatioAlertCardProps) {
  const summary = formatCostRatioAlertSummary(ma5, ma60, operatingDaysCount);
  const style = STYLE_MAP[summary.level];

  return (
    <div className={`rounded-3xl border p-5 ${style.container}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.badge}`}>
            <span>{style.icon}</span>
            <span>{summary.title}</span>
          </span>
          <span className="text-xs text-slate-400 flex items-center">
            원가율 경보 <TermTooltip term="원가율" />
          </span>
        </div>

        {summary.level !== 'insufficient' && ma5 !== null && ma60 !== null && summary.deltaPp !== null && (
          <div className="flex items-baseline gap-2 text-xs">
            <span className={`text-base font-bold ${style.accent}`}>
              5일 {ma5.toFixed(1)}%
            </span>
            <span className="text-slate-400">
              vs 60일 {ma60.toFixed(1)}% (
              <strong className={style.accent}>
                {summary.deltaPp >= 0 ? '+' : '−'}
                {Math.abs(summary.deltaPp).toFixed(1)}%p
              </strong>
              )
            </span>
          </div>
        )}
      </div>

      <p className="mt-2.5 text-sm leading-relaxed text-slate-200">{summary.message}</p>
    </div>
  );
}
