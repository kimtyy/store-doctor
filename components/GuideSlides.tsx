'use client';

import { useState } from 'react';

export interface GuideSlideData {
  step: number;
  badge: string;
  emoji: string;
  title: string;
  content: string;
  tip?: string;
  bulletPoints?: string[];
}

const GUIDE_SLIDES: GuideSlideData[] = [
  {
    step: 1,
    badge: '1단계 · 매출 등록',
    emoji: '📄',
    title: 'POS 정산서 업로드',
    content: '마감 후 POS 정산서를 올리면 매출이 자동 기록됩니다.',
    tip: '📄 긴 영수증은 폰 카메라의 "문서 스캔" 기능으로 저장해서 올리면 인식률이 크게 높아집니다.',
  },
  {
    step: 2,
    badge: '2단계 · 매입 등록',
    emoji: '🧾',
    title: '매입 영수증 및 직접 입력',
    content: '영수증도 같은 방식으로 촬영하거나 업로드할 수 있습니다.',
    tip: '짧은 영수증은 바로 촬영해도 됩니다. 영수증이 없거나 간이 영수증 지출은 매입 탭에서 직접 수동 입력하세요.',
  },
  {
    step: 3,
    badge: '3단계 · 진단 분석',
    emoji: '📊',
    title: '홈 대시보드 자동 분석',
    content: '매출과 매입 데이터가 쌓이면 홈에서 우리 매장 상태와 이동평균선, 수익 추세가 자동 분석됩니다.',
    bulletPoints: [
      '일별 순매출 및 매입액 비교',
      '이동평균선 추세 차트 제공',
      '동일 요일 및 지난달 평균 비교',
    ],
  },
  {
    step: 4,
    badge: '4단계 · 촬영 꿀팁',
    emoji: '💡',
    title: '인식률 100% 꿀팁',
    content: '영수증 촬영 시 아래 3가지만 기억해 주세요!',
    bulletPoints: [
      '📐 영수증을 평평한 바닥에 두고 정면에서 촬영',
      '📱 영수증이 길면 폰 카메라의 "문서 스캔" 활용',
      '☀️ 조명 빛 반사가 적은 밝은 장소에서 촬영',
    ],
  },
];

interface GuideSlidesProps {
  onComplete?: () => void;
  completeText?: string;
}

export default function GuideSlides({ onComplete, completeText = '시작하기' }: GuideSlidesProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const slide = GUIDE_SLIDES[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === GUIDE_SLIDES.length - 1;

  function handleNext() {
    if (isLast) {
      if (onComplete) onComplete();
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  }

  function handlePrev() {
    if (!isFirst) {
      setCurrentIndex((prev) => prev - 1);
    }
  }

  return (
    <div className="flex flex-col h-full max-w-md mx-auto justify-between space-y-6">
      {/* Slide Badge & Progress */}
      <div className="flex items-center justify-between">
        <span className="inline-block rounded-full bg-sky-950/80 border border-sky-800/60 px-3.5 py-1 text-xs font-semibold text-sky-400">
          {slide.badge}
        </span>
        <span className="text-xs font-medium text-slate-500">
          {currentIndex + 1} / {GUIDE_SLIDES.length}
        </span>
      </div>

      {/* Main Slide Card */}
      <div className="flex-1 rounded-3xl border border-slate-800 bg-slate-900/90 p-6 flex flex-col justify-between space-y-5 shadow-xl transition-all">
        <div>
          <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-3xl mb-4 shadow-inner">
            {slide.emoji}
          </div>
          <h3 className="text-xl font-bold text-slate-100 mb-2">{slide.title}</h3>
          <p className="text-sm text-slate-300 leading-relaxed">{slide.content}</p>

          {slide.bulletPoints && (
            <ul className="mt-4 space-y-2 rounded-2xl bg-slate-950/60 p-4 border border-slate-800/80 text-xs text-slate-300">
              {slide.bulletPoints.map((point, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-sky-400 font-bold shrink-0">•</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {slide.tip && (
          <div className="rounded-2xl bg-sky-950/40 border border-sky-800/40 p-4 text-xs text-sky-200 leading-relaxed">
            <span className="font-bold block mb-1 text-sky-300">💡 꿀팁</span>
            {slide.tip}
          </div>
        )}
      </div>

      {/* Navigation Controls */}
      <div className="space-y-4 pt-2">
        {/* Dots */}
        <div className="flex justify-center items-center gap-2">
          {GUIDE_SLIDES.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              className={`h-2 rounded-full transition-all ${
                idx === currentIndex ? 'w-6 bg-sky-400' : 'w-2 bg-slate-700'
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          {!isFirst && (
            <button
              type="button"
              onClick={handlePrev}
              className="flex-1 rounded-2xl border border-slate-700 bg-slate-900 py-3.5 text-sm font-semibold text-slate-300 hover:bg-slate-800 transition"
            >
              이전
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            className="flex-1 rounded-2xl bg-sky-500 py-3.5 text-sm font-bold text-slate-950 hover:bg-sky-400 transition shadow-lg shadow-sky-500/20"
          >
            {isLast ? completeText : '다음'}
          </button>
        </div>
      </div>
    </div>
  );
}
