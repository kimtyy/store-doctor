'use client';

import { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, ReferenceArea,
} from 'recharts';
import { COST_RATIO_THRESHOLDS } from '@/lib/analytics/costRatio';
import { detectCrosses } from '@/lib/analytics/movingAverage';
import { ClampedChartEventArea, STORE_EVENT_TYPE_META } from '@/lib/storeEvents';

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
  storeCostRatioAvg60?: number | null;
  events?: ClampedChartEventArea[];
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
    label: '총비용',
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

type MAKey = 'ma5' | 'ma20' | 'ma60' | 'ma120';

const DEFAULT_VISIBLE_BY_TAB: Record<TabKey, Record<MAKey, boolean>> = {
  revenue: { ma5: true, ma20: true, ma60: false, ma120: false },
  cost: { ma5: true, ma20: true, ma60: false, ma120: false },
  profit: { ma5: true, ma20: true, ma60: false, ma120: false },
  costRatio: { ma5: false, ma20: true, ma60: true, ma120: false },
};

export default function MAChart({ data, availability, storeCostRatioAvg60 = null, events = [] }: MAChartProps) {
  const [tab, setTab] = useState<TabKey>('revenue');
  const cfg = TABS.find((t) => t.key === tab)!;
  const [visibleByTab, setVisibleByTab] =
    useState<Record<TabKey, Record<MAKey, boolean>>>(DEFAULT_VISIBLE_BY_TAB);
  const visibleMAs = visibleByTab[tab];
  function toggleMA(key: MAKey) {
    setVisibleByTab((prev) => ({
      ...prev,
      [tab]: { ...prev[tab], [key]: !prev[tab][key] },
    }));
  }

  // 원가율 탭: 100% 상한에 맞춰 그린 뒤 툴팁에는 실제 원본 값을 표시
  const chartPlotData = useMemo(() => {
    if (!cfg.isCostRatio) return data;
    return data.map((d) => ({
      ...d,
      _rawCostRatioMa5: d.costRatioMa5,
      _rawCostRatioMa20: d.costRatioMa20,
      _rawCostRatioMa60: d.costRatioMa60,
      _rawCostRatioMa120: d.costRatioMa120,
      costRatioMa5: d.costRatioMa5 !== null ? Math.min(d.costRatioMa5, 100) : null,
      costRatioMa20: d.costRatioMa20 !== null ? Math.min(d.costRatioMa20, 100) : null,
      costRatioMa60: d.costRatioMa60 !== null ? Math.min(d.costRatioMa60, 100) : null,
      costRatioMa120: d.costRatioMa120 !== null ? Math.min(d.costRatioMa120, 100) : null,
    }));
  }, [data, cfg.isCostRatio]);

  const costRatioAvailability = useMemo<DataAvailability>(
    () => ({
      ma5: data.some((d) => d.costRatioMa5 !== null),
      ma20: data.some((d) => d.costRatioMa20 !== null),
      ma60: data.some((d) => d.costRatioMa60 !== null),
      ma120: data.some((d) => d.costRatioMa120 !== null),
    }),
    [data]
  );

  const effectiveAvailability = cfg.isCostRatio ? costRatioAvailability : availability;

  const crosses = useMemo(
    () =>
      !cfg.isCostRatio && data.length > 0
        ? detectCrosses(data, cfg.keys[0], cfg.keys[1])
        : [],
    // cfg.keys is a new array reference each render, so stringify key parts
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, cfg.keys[0], cfg.keys[1], cfg.isCostRatio]
  );

  if (data.length === 0) return null;

  const yFormatter = cfg.isCostRatio
    ? (v: number) => `${Math.round(v)}%`
    : (v: number) => `${Math.round(v / 10000)}만`;

  const renderTooltipContent = (tooltipProps: {
    active?: boolean;
    label?: string;
    payload?: Array<{
      dataKey?: string;
      name?: string;
      value?: number | null;
      color?: string;
      payload?: Record<string, unknown>;
    }>;
  }) => {
    const { active, label, payload } = tooltipProps;
    if (!active || !payload || payload.length === 0) return null;

    let hasOver100 = false;
    const rows = payload
      .filter((entry) => entry.value != null)
      .map((entry) => {
        if (!cfg.isCostRatio) {
          return {
            name: entry.name ?? '',
            color: entry.color ?? '#e2e8f0',
            text: `${((entry.value as number) / 10000).toFixed(1)}만원`,
          };
        }
        const rawKey = `_raw${String(entry.dataKey).charAt(0).toUpperCase()}${String(
          entry.dataKey
        ).slice(1)}`;
        const rawVal = entry.payload?.[rawKey];
        const actual = typeof rawVal === 'number' ? rawVal : (entry.value as number);
        if (actual > 100) hasOver100 = true;
        return {
          name: entry.name ?? '',
          color: entry.color ?? '#e2e8f0',
          text: `${actual.toFixed(1)}%${actual > 100 ? ' (상한 초과)' : ''}`,
        };
      });

    if (rows.length === 0) return null;

    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-lg">
        <p className="mb-1 text-slate-400">{label}</p>
        <div className="space-y-0.5">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center justify-between gap-3">
              <span style={{ color: r.color }}>{r.name}</span>
              <span className="font-semibold text-slate-100">{r.text}</span>
            </div>
          ))}
        </div>
        {hasOver100 && (
          <p className="mt-1.5 border-t border-slate-800 pt-1 text-[11px] text-amber-300">
            매출 입력이 적은 구간 (100% 상단 고정)
          </p>
        )}
      </div>
    );
  };

  // Custom dot for 5일선: shows ↑ golden cross, ↓ death cross (매출·총비용·순이익 탭 전용)
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
          <LineChart data={chartPlotData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
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
              domain={cfg.isCostRatio ? [0, 100] : ['auto', 'auto']}
              ticks={cfg.isCostRatio ? [0, 25, 50, 75, 100] : undefined}
            />
            <Tooltip content={renderTooltipContent as never} />
            <Legend
              wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
              formatter={(value) => <span style={{ color: '#94a3b8' }}>{value}</span>}
            />
            {events.map((ev) => (
              <ReferenceArea
                key={ev.id}
                x1={ev.x1}
                x2={ev.x2}
                fill={ev.fill}
                stroke={ev.stroke}
                strokeOpacity={0.5}
                ifOverflow="extendDomain"
              />
            ))}
            {cfg.isCostRatio && (
              <>
                <ReferenceLine
                  y={COST_RATIO_THRESHOLDS.INDUSTRY_REFERENCE_PCT}
                  stroke="#94a3b8"
                  strokeDasharray="4 3"
                />
                {storeCostRatioAvg60 != null && storeCostRatioAvg60 <= 100 && (
                  <ReferenceLine
                    y={storeCostRatioAvg60}
                    stroke="#38bdf8"
                    strokeDasharray="2 2"
                  />
                )}
              </>
            )}
            {visibleMAs.ma5 && effectiveAvailability.ma5 && (
              <Line
                type="monotone"
                dataKey={cfg.keys[0]}
                stroke={cfg.colors[0]}
                strokeWidth={2.5}
                dot={cfg.isCostRatio ? false : (renderCrossDot as unknown as boolean)}
                activeDot={{ r: 4 }}
                name={MA_LABELS[0]}
                isAnimationActive={false}
                connectNulls={false}
              />
            )}
            {visibleMAs.ma20 && effectiveAvailability.ma20 && (
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
            {visibleMAs.ma60 && effectiveAvailability.ma60 && (
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
            {visibleMAs.ma120 && effectiveAvailability.ma120 && (
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

      {/* 이벤트 기간 음영 범례 */}
      {events.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-1 pt-0.5 text-[11px] text-slate-400">
          <span className="text-slate-500">매장 사정:</span>
          {Array.from(new Set(events.map((e) => e.type))).map((type) => {
            const meta = STORE_EVENT_TYPE_META[type] ?? STORE_EVENT_TYPE_META.other;
            return (
              <span key={type} className="inline-flex items-center gap-1">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm border"
                  style={{ backgroundColor: meta.chartFill, borderColor: meta.chartStroke }}
                />
                <span>{meta.shortLabel}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* 원가율 기준선 범례 및 안내 문구 (차트 바깥 분리로 선 겹침 방지) */}
      {cfg.isCostRatio && (
        <div className="space-y-1.5 px-1">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-4 border-t border-dashed border-slate-400" />
              <span>일반 참고 {COST_RATIO_THRESHOLDS.INDUSTRY_REFERENCE_PCT}%</span>
            </span>
            {storeCostRatioAvg60 != null && (
              <span className="inline-flex items-center gap-1.5 text-sky-300">
                <span className="inline-block w-4 border-t border-dotted border-sky-400" />
                <span>매장 60일 평균 {storeCostRatioAvg60.toFixed(1)}%</span>
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            재료는 며칠에 한 번 몰아 사기 때문에 짧은 기간 원가율은 크게 흔들립니다. 20일 이상 흐름을 보세요.
          </p>
        </div>
      )}

      {/* MA 선 토글 */}
      <div className="flex gap-2 flex-wrap">
        {(AVAIL_KEYS as MAKey[]).map((key, i) => {
          const active = visibleMAs[key];
          const lineColor = LINE_COLORS[i];
          const hasData = effectiveAvailability[key];
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
