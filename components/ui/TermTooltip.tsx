'use client';

import { useState } from 'react';

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
    explanation: '가게에서 거래된 전체 매출 금액.',
  },
  총매입: {
    term: '총매입',
    explanation: '재료·주류·물품 구입을 포함해 나간 전체 매입 금액.',
  },
};

interface TermTooltipProps {
  term?: string;
  text?: string;
  className?: string;
}

export default function TermTooltip({ term, text, className = '' }: TermTooltipProps) {
  const [open, setOpen] = useState(false);

  const matched = term ? TERMS_DICT[term] : undefined;
  const displayTerm = matched?.term ?? term ?? '용어 설명';
  const explanation = text ?? matched?.explanation;

  if (!explanation) return null;

  return (
    <span className={`inline-flex items-center align-middle ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={`${displayTerm} 설명 보기`}
        className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-bold text-slate-400 hover:text-sky-300 hover:border-sky-500/50 transition shrink-0 print:hidden"
      >
        ⓘ
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-150 print:hidden"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        >
          <div
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="font-bold text-sky-400 text-base flex items-center gap-2">
                <span>💡</span> {displayTerm}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200 text-sm font-bold transition"
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-slate-200 leading-relaxed py-1">{explanation}</p>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full rounded-2xl bg-sky-500 hover:bg-sky-400 py-3 text-sm font-bold text-slate-950 transition shadow-lg shadow-sky-500/20"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
