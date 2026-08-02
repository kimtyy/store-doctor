'use client';

import GuideSlides from './GuideSlides';

interface OnboardingGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function OnboardingGuideModal({ isOpen, onClose }: OnboardingGuideModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-lg font-bold text-sky-400">🎉 매장닥터 시작하기</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 text-xl font-bold px-2"
          >
            ✕
          </button>
        </div>

        <GuideSlides onComplete={onClose} completeText="시작하기" />
      </div>
    </div>
  );
}
