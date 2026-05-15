'use client';

import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

export interface MAChartDataPoint {
  date: string;
  revenueMa5: number | null;
  revenueMa20: number | null;
  revenueMa60: number | null;
  costMa5: number | null;
  costMa20: number | null;
  costMa60: number | null;
  profitMa5: number | null;
  profitMa20: number | null;
  profitMa60: number | null;
}

export interface DataAvailability {
  ma5: boolean;
  ma20: boolean;
  ma60: boolean;
}

export interface MAChartProps {
  data: MAChartDataPoint[];
  availability: DataAvailability;
}

type Period = '5' | '20' | '60';

const PERIODS: { key: Period; label: string; revKey: keyof MAChartDataPoint; costKey: keyof MAChartDataPoint; profitKey: keyof MAChartDataPoint; availKey: keyof DataAvailability }[] = [
  { key: '5', label: '5일선', revKey: 'revenueMa5', costKey: 'costMa5', profitKey: 'profitMa5', availKey: 'ma5' },
  { key: '20', label: '20일선', revKey: 'revenueMa20', costKey: 'costMa20', profitKey: 'profitMa20', availKey: 'ma20' },
  { key: '60', label: '60일선', revKey: 'revenueMa60', costKey: 'costMa60', profitKey: 'profitMa60', availKey: 'ma60' },
];

export default function MAChart({ data, availability }: MAChartProps) {
  const firstAvailable = PERIODS.find((p) => availability[p.availKey])?.key ?? '5';
  const [period, setPeriod] = useState<Period>(firstAvailable as Period);

  if (data.length === 0) return null;

  const p = PERIODS.find((x) => x.key === period)!;

  return (
    <div className="space-y-3">
      {/* 기간 선택 */}
      <div className="flex gap-2">
        {PERIODS.map((per) => {
          const avail = availability[per.availKey];
          return (
            <button
              key={per.key}
              type="button"
              onClick={() => avail && setPeriod(per.key)}
              disabled={!avail}
              className={`flex-1 rounded-xl py-2 text-xs font-semibold transition ${
                period === per.key
                  ? 'bg-sky-600 text-white'
                  : avail
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  : 'bg-slate-900 text-slate-600 cursor-not-allowed'
              }`}
            >
              {per.label}
            </button>
          );
        })}
      </div>

      {/* 차트 */}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="date"
              stroke="#334155"
              tick={{ fill: '#64748b', fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="#334155"
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickFormatter={(v) => `${Math.round(v / 10000)}만`}
              width={36}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '12px',
                fontSize: '12px',
              }}
              labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
              formatter={(v: unknown) =>
                v != null ? `${((v as number) / 10000).toFixed(1)}만원` : '-'
              }
            />
            <Legend
              wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
              formatter={(value) => <span style={{ color: '#94a3b8' }}>{value}</span>}
            />
            <Line
              type="monotone"
              dataKey={p.revKey}
              stroke="#38bdf8"
              strokeWidth={2}
              dot={false}
              name="매출"
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey={p.costKey}
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              name="매입"
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey={p.profitKey}
              stroke="#34d399"
              strokeWidth={2}
              dot={false}
              name="순이익"
              isAnimationActive={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 데이터 충족 여부 */}
      <div className="flex gap-4 text-xs text-slate-500">
        {PERIODS.map((per) => (
          <span key={per.key} className="flex items-center gap-1">
            {per.label}
            {availability[per.availKey]
              ? <span className="text-emerald-400">✅</span>
              : <span className="text-amber-400">🔶</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
