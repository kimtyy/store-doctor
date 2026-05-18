'use client';

import { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';

export interface MAChartDataPoint {
  date: string;
  revenueMa5: number | null;
  revenueMa20: number | null;
  revenueMa60: number | null;
  revenueMa120: number | null;
  costMa5: number | null;
  costMa20: number | null;
  costMa60: number | null;
  costMa120: number | null;
  profitMa5: number | null;
  profitMa20: number | null;
  profitMa60: number | null;
  profitMa120: number | null;
  costRatioMa5: number | null;
  costRatioMa20: number | null;
  costRatioMa60: number | null;
  costRatioMa120: number | null;
}

export interface DataAvailability {
  ma5: boolean;
  ma20: boolean;
  ma60: boolean;
  ma120: boolean;
}

export interface MAChartProps {
  data: MAChartDataPoint[];
  availability: DataAvailability;
}

type TabKey = 'revenue' | 'cost' | 'profit' | 'costRatio';

interface TabConfig {
  key: TabKey;
  label: string;
  keys: [keyof MAChartDataPoint, keyof MAChartDataPoint, keyof MAChartDataPoint, keyof MAChartDataPoint];
  colors: [string, string, string, string];
  activeClass: string;
  isCostRatio: boolean;
}

// HTS 공통 이평선 색상: 5일(흰색) / 20일(노랑) / 60일(주황) / 120일(빨강)
const LINE_COLORS: [string, string, string, string] = ['#e2e8f0', '#facc15', '#f97316', '#ef4444'];

const TABS: TabConfig[] = [
  {
    key: 'revenue',
    label: '매출',
    keys: ['revenueMa5', 'revenueMa20', 'revenueMa60', 'revenueMa120'],
    colors: LINE_COLORS,
    activeClass: 'bg-sky-600 text-white',
    isCostRatio: false,
  },
  {
    key: 'cost',
    label: '매입',
    keys: ['costMa5', 'costMa20', 'costMa60', 'costMa120'],
    colors: LINE_COLORS,
    activeClass: 'bg-amber-600 text-white',
    isCostRatio: false,
  },
  {
    key: 'profit',
    label: '순이익',
    keys: ['profitMa5', 'profitMa20', 'profitMa60', 'profitMa120'],
    colors: LINE_COLORS,
    activeClass: 'bg-emerald-600 text-white',
    isCostRatio: false,
  },
  {
    key: 'costRatio',
    label: '원가율',
    keys: ['costRatioMa5', 'costRatioMa20', 'costRatioMa60', 'costRatioMa120'],
    colors: LINE_COLORS,
    activeClass: 'bg-rose-600 text-white',
    isCostRatio: true,
  },
];

const MA_LABELS = ['5일', '20일', '60일', '120일'] as const;
const AVAIL_KEYS: (keyof DataAvailability)[] = ['ma5', 'ma20', 'ma60', 'ma120'];

function detectCrosses(
  data: MAChartDataPoint[],
  ma5Key: keyof MAChartDataPoint,
  ma20Key: keyof MAChartDataPoint,
): ('golden' | 'death' | null)[] {
  return data.map((point, i) => {
    if (i === 0) return null;
    const prev = data[i - 1];
    const cur5 = point[ma5Key] as number | null;
    const prev5 = prev[ma5Key] as number | null;
    const cur20 = point[ma20Key] as number | null;
    const prev20 = prev[ma20Key] as number | null;
    if (cur5 == null || prev5 == null || cur20 == null || prev20 == null) return null;
    if (prev5 <= prev20 && cur5 > cur20) return 'golden';
    if (prev5 >= prev20 && cur5 < cur20) return 'death';
    return null;
  });
}

type MAKey = 'ma5' | 'ma20' | 'ma60' | 'ma120';

export default function MAChart({ data, availability }: MAChartProps) {
  const [tab, setTab] = useState<TabKey>('revenue');
  const cfg = TABS.find((t) => t.key === tab)!;
  const [visibleMAs, setVisibleMAs] = useState<Record<MAKey, boolean>>({
    ma5: true, ma20: true, ma60: false, ma120: false,
  });
  function toggleMA(key: MAKey) {
    setVisibleMAs(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const crosses = useMemo(
    () => (data.length > 0 ? detectCrosses(data, cfg.keys[0], cfg.keys[1]) : []),
    // cfg.keys is a new array reference each render, so stringify key parts
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, cfg.keys[0], cfg.keys[1]]
  );

  if (data.length === 0) return null;

  const yFormatter = cfg.isCostRatio
    ? (v: number) => `${Math.round(v)}%`
    : (v: number) => `${Math.round(v / 10000)}만`;

  const tooltipFormatter = cfg.isCostRatio
    ? (v: unknown) => (v != null ? `${(v as number).toFixed(1)}%` : '-')
    : (v: unknown) => (v != null ? `${((v as number) / 10000).toFixed(1)}만원` : '-');

  // Custom dot for 5일선: shows ↑ golden cross, ↓ death cross
  const renderCrossDot = (dotProps: Record<string, unknown>) => {
    const cx = dotProps.cx as number | undefined;
    const cy = dotProps.cy as number | undefined;
    const index = dotProps.index as number | undefined;
    if (cx == null || cy == null || index == null) return <circle key="empty" r={0} />;
    const cross = crosses[index];
    if (cross === 'golden') {
      return <text key={`gc-${index}`} x={cx} y={cy - 9} textAnchor="middle" fontSize={13} fill="#34d399">↑</text>;
    }
    if (cross === 'death') {
      return <text key={`dc-${index}`} x={cx} y={cy + 15} textAnchor="middle" fontSize={13} fill="#f43f5e">↓</text>;
    }
    return <circle key={`nd-${index}`} r={0} />;
  };

  return (
    <div className="space-y-3">
      {/* 탭 */}
      <div className="flex gap-1 rounded-xl bg-slate-800/60 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
              tab === t.key ? t.activeClass : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 차트 */}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
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
              tickFormatter={yFormatter}
              width={40}
              domain={cfg.isCostRatio ? [0, 'auto'] : ['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', fontSize: '12px' }}
              labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
              formatter={tooltipFormatter}
            />
            <Legend
              wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
              formatter={(value) => <span style={{ color: '#94a3b8' }}>{value}</span>}
            />
            {cfg.isCostRatio && (
              <>
                <ReferenceLine y={55} stroke="#f59e0b" strokeDasharray="4 3" label={{ value: '주의 55%', fill: '#f59e0b', fontSize: 9, position: 'insideTopRight' }} />
                <ReferenceLine y={70} stroke="#f43f5e" strokeDasharray="4 3" label={{ value: '위험 70%', fill: '#f43f5e', fontSize: 9, position: 'insideTopRight' }} />
              </>
            )}
            {visibleMAs.ma5 && (
              <Line
                type="monotone"
                dataKey={cfg.keys[0]}
                stroke={cfg.colors[0]}
                strokeWidth={2.5}
                dot={renderCrossDot as unknown as boolean}
                activeDot={{ r: 4 }}
                name={MA_LABELS[0]}
                isAnimationActive={false}
                connectNulls={false}
              />
            )}
            {visibleMAs.ma20 && (
              <Line
                type="monotone"
                dataKey={cfg.keys[1]}
                stroke={cfg.colors[1]}
                strokeWidth={2}
                dot={false}
                name={MA_LABELS[1]}
                isAnimationActive={false}
                connectNulls={false}
              />
            )}
            {visibleMAs.ma60 && availability.ma60 && (
              <Line
                type="monotone"
                dataKey={cfg.keys[2]}
                stroke={cfg.colors[2]}
                strokeWidth={1.5}
                dot={false}
                name={MA_LABELS[2]}
                isAnimationActive={false}
                connectNulls={false}
              />
            )}
            {visibleMAs.ma120 && availability.ma120 && (
              <Line
                type="monotone"
                dataKey={cfg.keys[3]}
                stroke={cfg.colors[3]}
                strokeWidth={1.5}
                dot={false}
                name={MA_LABELS[3]}
                isAnimationActive={false}
                connectNulls={false}
                strokeDasharray="6 3"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* MA 선 토글 */}
      <div className="flex gap-2 flex-wrap">
        {(AVAIL_KEYS as MAKey[]).map((key, i) => {
          const active = visibleMAs[key];
          const lineColor = LINE_COLORS[i];
          const hasData = availability[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleMA(key)}
              className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold border transition ${
                active
                  ? 'border-transparent text-slate-950'
                  : 'border-slate-700 bg-slate-800/60 text-slate-500 hover:text-slate-300'
              }`}
              style={active ? { backgroundColor: lineColor } : undefined}
            >
              {MA_LABELS[i]}
              {!hasData && <span className="opacity-50 text-[9px]">⚠</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
