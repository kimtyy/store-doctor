'use client';

import { useState, useRef, useEffect } from 'react';

export const TERMS_DICT: Record<string, { term: string; explanation: string }> = {
  원가율: {
    term: '원가율',
    explanation: '매출 100원 벌 때 재료·주류값으로 나간 돈의 비율. 낮을수록 남는 게 많아요.',
  },
  순이익: {
    term: '순이익',
    explanation: '번 돈에서 재료값·인건비·월세 등을 다 빼고 실제로 남은 돈.',
  },
  순매출: {
    term: '순매출',
    explanation: '손님이 낸 돈에서 부가세를 뺀 실제 매출.',
  },
  이동평균선: {
    term: '이동평균선',
    explanation: '며칠치를 평균 낸 선. 들쭉날쭉한 하루하루 대신 전체 흐름을 봅니다.',
  },
  'BEP(손익분기점)': {
    term: 'BEP (손익분기점)',
    explanation: '이만큼은 팔아야 본전. 이 금액을 넘으면 그때부터 남는 겁니다.',
  },
  BEP: {
    term: 'BEP (손익분기점)',
    explanation: '이만큼은 팔아야 본전. 이 금액을 넘으면 그때부터 남는 겁니다.',
  },
  손익분기점: {
    term: '손익분기점',
    explanation: '이만큼은 팔아야 본전. 이 금액을 넘으면 그때부터 남는 겁니다.',
  },
  안전마진율: {
    term: '안전마진율',
    explanation: '본전 금액보다 얼마나 여유 있게 팔고 있는지. 높을수록 안정적입니다.',
  },
  객단가: {
    term: '객단가',
    explanation: '손님 한 분이 평균 얼마를 쓰고 가는지.',
  },
  총매출: {
    term: '총매출',
    explanation: '손님이 결제한 부가세/할인 포함 또는 제외 전 거래 총액.',
  },
  총매입: {
    term: '총매입',
    explanation: '식자재, 주류, 음료 및 수동 지출 등 매장에서 구매한 전체 물품 금액.',
  },
};

interface TermTooltipProps {
  term?: string;
  text?: string;
  className?: string;
}

export default function TermTooltip({ term, text, className = '' }: TermTooltipProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  const matched = term ? TERMS_DICT[term] : undefined;
  const displayTerm = matched?.term ?? term ?? '용어 설명';
  const explanation = text ?? matched?.explanation;

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [open]);

  if (!explanation) return null;

  return (
    <span ref={containerRef} className={`relative inline-flex items-center align-middle ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={`${displayTerm} 설명 보기`}
        className="ml-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-slate-800/80 border border-slate-700/80 text-[9px] font-bold text-slate-400 hover:text-sky-300 hover:border-sky-500/50 transition shrink-0 print:hidden"
      >
        ⓘ
      </button>

      {open && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 z-50 rounded-2xl bg-slate-900 border border-slate-700 p-3 text-xs text-slate-200 shadow-2xl backdrop-blur-md animate-in fade-in duration-150 print:hidden">
          <div className="flex items-center justify-between mb-1.5 border-b border-slate-800 pb-1">
            <span className="font-bold text-sky-400 text-[11px]">💡 {displayTerm}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
              className="text-slate-500 hover:text-slate-300 text-xs px-1"
            >
              ✕
            </button>
          </div>
          <p className="leading-relaxed text-[11px] text-slate-300">{explanation}</p>
          {/* Arrow pointing down */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-700" />
        </div>
      )}
    </span>
  );
}
