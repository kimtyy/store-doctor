'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export interface MAChartDataPoint {
  date: string;
  revenue: number;
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  ma120: number | null;
}

export interface MAChartProps {
  data: MAChartDataPoint[];
  title?: string;
}

export default function MAChart({ data, title = '매출 이동평균선' }: MAChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-6">
        <p className="text-slate-400">데이터가 없습니다.</p>
      </div>
    );
  }

  // 최근 60일만 표시
  const displayData = data.slice(Math.max(0, data.length - 60));

  return (
    <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-6">
      <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
      <div className="mt-6 h-96 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={displayData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="date" stroke="#94a3b8" style={{ fontSize: '12px' }} />
            <YAxis stroke="#94a3b8" style={{ fontSize: '12px' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                border: '1px solid #475569',
                borderRadius: '12px',
              }}
              labelStyle={{ color: '#e2e8f0' }}
              formatter={(value: any) => (value !== null ? `${(value / 10000).toFixed(1)}만원` : '-')}
            />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#64748b"
              dot={false}
              name="실제 매출"
              strokeWidth={1.5}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="ma5"
              stroke="#3b82f6"
              dot={false}
              name="5일선"
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="ma20"
              stroke="#10b981"
              dot={false}
              name="20일선"
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="ma60"
              stroke="#f59e0b"
              dot={false}
              name="60일선"
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="ma120"
              stroke="#ef4444"
              dot={false}
              name="120일선"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
