'use client';

import { DiagnosisResult } from '../../lib/analytics/diagnosis';

export interface DiagnosisCardProps {
  diagnosis: DiagnosisResult;
  todayProfit: number;
  costRatio: number;
  costRatioMA5: number | null;
  avgSpend: number;
}

export default function DiagnosisCard({ diagnosis, todayProfit, costRatio, costRatioMA5, avgSpend }: DiagnosisCardProps) {
  const statusColors = {
    growth: 'from-emerald-500/20 to-emerald-500/10 border-emerald-500/30',
    caution: 'from-amber-500/20 to-amber-500/10 border-amber-500/30',
    danger: 'from-rose-500/20 to-rose-500/10 border-rose-500/30',
    stable: 'from-sky-500/20 to-sky-500/10 border-sky-500/30',
  };

  const titleColors = {
    growth: 'text-emerald-400',
    caution: 'text-amber-400',
    danger: 'text-rose-400',
    stable: 'text-sky-400',
  };

  function ma5Color(v: number) {
    if (v > 70) return 'text-rose-400';
    if (v >= 55) return 'text-amber-400';
    return 'text-sky-400';
  }

  return (
    <div className={`rounded-3xl bg-gradient-to-br border-2 ${statusColors[diagnosis.status]} p-8 shadow-lg`}>
      <div className="space-y-6">
        <div>
          <p className="text-sm text-slate-400">오늘의 진단</p>
          <h2 className={`mt-2 text-4xl font-bold ${titleColors[diagnosis.status]}`}>{diagnosis.title}</h2>
          <p className="mt-2 text-slate-300">{diagnosis.description}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 rounded-2xl border border-slate-700/50 bg-slate-950/50 p-6">
          <div>
            <p className="text-sm text-slate-400">오늘 순이익</p>
            <p className={`mt-2 text-3xl font-bold ${todayProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {todayProfit >= 0 ? '+' : ''}{(todayProfit / 10000).toFixed(1)}만원
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-400">오늘 원가율</p>
            <p className="mt-2 text-3xl font-bold text-slate-200">
              {costRatio.toFixed(1)}%
            </p>
            {costRatioMA5 !== null && (
              <p className={`mt-1 text-xs font-medium ${ma5Color(costRatioMA5)}`}>
                5일평균 {costRatioMA5.toFixed(1)}%
              </p>
            )}
          </div>
          <div>
            <p className="text-sm text-slate-400">객단가</p>
            <p className="mt-2 text-3xl font-bold text-slate-200">{(avgSpend / 10000).toFixed(1)}만원</p>
          </div>
        </div>

        {diagnosis.alerts.length > 0 ? (
          <div className="space-y-2 rounded-2xl bg-slate-950/80 p-5">
            <p className="text-sm font-semibold text-slate-300">주요 알림</p>
            <div className="space-y-2">
              {diagnosis.alerts.map((alert, idx) => (
                <p key={idx} className="text-sm text-slate-300">
                  {alert}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
