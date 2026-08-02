'use client';

import { useMemo } from 'react';

export type PeriodType = '7' | '30' | 'monthly' | 'all' | 'custom';

export interface MonthSelection {
  year: number;
  month: number;
}

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export interface PeriodValue {
  type: PeriodType;
  selectedMonth?: MonthSelection;
  customRange?: DateRange;
}

interface PeriodSelectorProps {
  value: PeriodValue;
  onChange: (value: PeriodValue) => void;
  availableMonths?: MonthSelection[];
  className?: string;
}

const PRESETS: { type: PeriodType; label: string; icon?: string }[] = [
  { type: '7', label: '최근 7일' },
  { type: '30', label: '최근 30일' },
  { type: 'monthly', label: '월별' },
  { type: 'all', label: '전체' },
  { type: 'custom', label: '기간 설정', icon: '📅' },
];

function getTodayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDaysAgoString(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatKoreanDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  return `${y}년 ${m}월 ${d}일`;
}

function shiftMonth(m: MonthSelection, delta: number): MonthSelection {
  const d = new Date(m.year, m.month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export default function PeriodSelector({
  value,
  onChange,
  availableMonths = [],
  className = '',
}: PeriodSelectorProps) {
  const currentMonthYear = value.selectedMonth?.year ?? new Date().getFullYear();
  const currentMonthNum = value.selectedMonth?.month ?? (new Date().getMonth() + 1);
  const currentMonth = useMemo(() => ({
    year: currentMonthYear,
    month: currentMonthNum,
  }), [currentMonthYear, currentMonthNum]);

  const customRange = value.customRange ?? {
    startDate: getDaysAgoString(30),
    endDate: getTodayString(),
  };

  const canGoPrev = useMemo(() => {
    if (availableMonths.length === 0) return true;
    const minMonth = availableMonths[0]; // sorted ascending
    return (
      currentMonthYear > minMonth.year ||
      (currentMonthYear === minMonth.year && currentMonthNum > minMonth.month)
    );
  }, [availableMonths, currentMonthYear, currentMonthNum]);

  const canGoNext = useMemo(() => {
    const now = new Date();
    return (
      currentMonthYear < now.getFullYear() ||
      (currentMonthYear === now.getFullYear() && currentMonthNum < now.getMonth() + 1)
    );
  }, [currentMonthYear, currentMonthNum]);

  function handleTypeChange(type: PeriodType) {
    if (type === value.type) return;

    const newValue: PeriodValue = {
      ...value,
      type,
    };

    if (type === 'monthly' && !newValue.selectedMonth) {
      const now = new Date();
      newValue.selectedMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
    }

    if (type === 'custom' && !newValue.customRange) {
      newValue.customRange = {
        startDate: getDaysAgoString(30),
        endDate: getTodayString(),
      };
    }

    onChange(newValue);
  }

  function handleMonthChange(delta: number) {
    const nextMonth = shiftMonth(currentMonth, delta);
    onChange({
      ...value,
      type: 'monthly',
      selectedMonth: nextMonth,
    });
  }

  function handleCustomDateChange(field: 'startDate' | 'endDate', val: string) {
    const nextRange = { ...customRange, [field]: val };

    // Auto-adjust if start date > end date
    if (field === 'startDate' && nextRange.startDate > nextRange.endDate) {
      nextRange.endDate = nextRange.startDate;
    } else if (field === 'endDate' && nextRange.endDate < nextRange.startDate) {
      nextRange.startDate = nextRange.endDate;
    }

    onChange({
      ...value,
      type: 'custom',
      customRange: nextRange,
    });
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Preset Chips */}
      <div className="flex gap-1.5 flex-wrap">
        {PRESETS.map((preset) => {
          const isActive = value.type === preset.type;
          return (
            <button
              key={preset.type}
              type="button"
              onClick={() => handleTypeChange(preset.type)}
              className={`px-3.5 py-2 rounded-full text-xs font-semibold transition active:scale-95 cursor-pointer flex items-center gap-1 ${
                isActive
                  ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20 font-bold'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              {preset.icon && <span>{preset.icon}</span>}
              <span>{preset.label}</span>
            </button>
          );
        })}
      </div>

      {/* Monthly Navigation UI */}
      {value.type === 'monthly' && (
        <div className="flex items-center justify-center gap-4 rounded-2xl bg-slate-900/80 border border-slate-800 p-3">
          <button
            type="button"
            onClick={() => handleMonthChange(-1)}
            disabled={!canGoPrev}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-800 text-slate-200 disabled:opacity-30 hover:bg-slate-700 active:scale-95 transition text-base font-bold cursor-pointer"
            aria-label="이전 달"
          >
            ←
          </button>
          <span className="text-sm font-bold text-slate-100 min-w-[120px] text-center">
            {currentMonth.year}년 {currentMonth.month}월
          </span>
          <button
            type="button"
            onClick={() => handleMonthChange(1)}
            disabled={!canGoNext}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-800 text-slate-200 disabled:opacity-30 hover:bg-slate-700 active:scale-95 transition text-base font-bold cursor-pointer"
            aria-label="다음 달"
          >
            →
          </button>
        </div>
      )}

      {/* Custom Date Range Picker UI */}
      {value.type === 'custom' && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1">
              <span>📅</span>
              <span>기간 선택</span>
            </span>
            {customRange.startDate && customRange.endDate && (
              <span className="text-xs text-sky-400 font-medium">
                {formatKoreanDate(customRange.startDate)} ~ {formatKoreanDate(customRange.endDate)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Start Date */}
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-medium">시작일</label>
              <input
                type="date"
                value={customRange.startDate}
                onChange={(e) => handleCustomDateChange('startDate', e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none min-h-[44px]"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-xs text-slate-400 mb-1 font-medium font-medium">종료일</label>
              <input
                type="date"
                value={customRange.endDate}
                onChange={(e) => handleCustomDateChange('endDate', e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none min-h-[44px]"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
