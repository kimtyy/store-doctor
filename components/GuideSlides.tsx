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
    badge: '1단계 · 매출 넣기',
    emoji: '📄',
    title: '마감 정산서 올리기',
    content: '하루 장사 끝나고 포스기에서 나온 마감 정산서를 올리면 그날 매출이 저절로 적힙니다.',
    tip: '📄 정산서가 길면 폰 카메라의 "문서 스캔"으로 찍어 저장한 뒤 올려주세요. 훨씬 잘 읽어냅니다.',
  },
  {
    step: 2,
    badge: '2단계 · 매입 넣기',
    emoji: '🧾',
    title: '물건 산 영수증 넣기',
    content: '재료나 술을 사고 받은 영수증도 똑같이 올리면 나간 돈이 적힙니다.',
    tip: '💡 짧은 영수증은 그냥 찍어도 됩니다. 영수증이 없는 지출은 매입 탭에서 직접 적어주세요.',
  },
  {
    step: 3,
    badge: '3단계 · 매장 상태 보기',
    emoji: '📊',
    title: '우리 매장, 잘 되고 있나?',
    content: '며칠 쌓이면 홈 화면에서 우리 매장이 어떤지 알아서 알려드립니다.',
    bulletPoints: [
      '하루하루 번 돈과 나간 돈 비교',
      '며칠치 평균으로 보는 흐름 (이동평균선)',
      '지난주 같은 요일, 지난달과 비교',
    ],
  },
  {
    step: 4,
    badge: '4단계 · 사진 잘 찍는 법',
    emoji: '💡',
    title: '사진 잘 찍는 3가지',
    content: '이것만 지키면 거의 다 읽어냅니다.',
    bulletPoints: [
      '📐 평평한 곳에 놓고 위에서 똑바로',
      '📱 영수증이 길면 폰의 "문서 스캔"으로',
      '☀️ 밝은 곳에서, 반짝임 없게',
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
