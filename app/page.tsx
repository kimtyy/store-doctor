'use client';

import { useState, useEffect, useRef } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useMotionTemplate,
} from 'framer-motion';
import { Navbar } from '@/components/landing/Navbar';
import { ScrambleIn } from '@/components/landing/ScrambleText';
import { ConnectAILabLogo } from '@/components/landing/ConnectAILabLogo';
import { SITE_CONFIG } from '@/config/landingContent';

export default function LandingPage() {
  const [entranceComplete, setEntranceComplete] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  /* ── Dynamic Icon Injection ── */
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css';
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  /* ── Entrance delay ── */
  useEffect(() => {
    const timer = setTimeout(() => setEntranceComplete(true), 800);
    return () => clearTimeout(timer);
  }, []);

  /* ── Section 2 scroll-driven 3D text ── */
  const section2Ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: section2Ref,
    offset: ['start end', 'end start'],
  });
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 15,
    damping: 32,
    mass: 1.8,
  });
  const yScaleValue = useTransform(smoothProgress, [0, 1], [60, -120]);
  const textOpacity = useTransform(smoothProgress, [0.3, 0.5], [0, 1]);
  const transform3D = useMotionTemplate`rotateX(24deg) translateY(${yScaleValue}px) translateZ(15px)`;

  /* ── Destructure config for readability ── */
  const { hero, cinematic, metrics, technology, architecture, footer } = SITE_CONFIG;

  return (
    <div className="bg-black text-white min-h-screen">
      <Navbar entranceComplete={entranceComplete} />

      {/* ════════════════ SECTION 1: HERO ════════════════ */}
      <section className="relative h-screen h-[100dvh] flex flex-col overflow-hidden">
        {/* Hero looping video background */}
        {!videoFailed ? (
          <video
            src="https://videos.pexels.com/video-files/3195394/3195394-hd_1920_1080_25fps.mp4"
            poster="/cafe_counter_bright.png"
            className="absolute inset-0 w-full h-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            onError={() => setVideoFailed(true)}
          />
        ) : (
          <img
            src="/cafe_counter_bright.png"
            className="absolute inset-0 w-full h-full object-cover"
            alt="Fallback Cafe Counter Background"
          />
        )}

        {/* Adjusted light dark overlay for brightness */}
        <div className="absolute inset-0 bg-black/20 z-10" />

        {/* Dot grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            opacity: 0.03,
          }}
        />

        {/* Watermark text */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
          style={{ paddingTop: 50 }}
        >
          <span
            className="uppercase select-none drop-shadow-lg"
            style={{
              fontFamily: '"Anton SC", sans-serif',
              fontSize: 'clamp(80px, 20vw, 360px)',
              letterSpacing: '-4px',
              opacity: 0.08,
              background:
                'radial-gradient(circle, rgba(142,127,148,0) 0%, #8E7F94 70%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: 'transparent',
              lineHeight: 1,
              textShadow: '0 2px 8px rgba(0,0,0,0.8)',
            }}
          >
            {hero.watermark}
          </span>
        </div>

        {/* Hero content */}
        <motion.div
          className="relative z-20 flex flex-col flex-1 px-4 sm:px-6 md:px-8 pt-20 sm:pt-24 pb-8 sm:pb-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: entranceComplete ? 1 : 0 }}
          transition={{ duration: 1 }}
        >
          <div className="flex-1" />

          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            {/* Left column */}
            <div className="flex flex-col gap-4 items-start">
              <h1
                className="text-white font-light leading-[0.95] tracking-[-0.03em] drop-shadow-lg"
                style={{ fontSize: 'clamp(40px, 8vw, 88px)', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
              >
                <ScrambleIn text={hero.titleLeft[0]} delay={200} triggered={entranceComplete} />
                <br />
                <ScrambleIn text={hero.titleLeft[1]} delay={500} triggered={entranceComplete} />
              </h1>

              <motion.p
                className="max-w-sm text-[13px] sm:text-[15px] text-white/90 font-medium leading-relaxed drop-shadow-lg"
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
                initial={{ opacity: 0, y: 25 }}
                animate={entranceComplete ? { opacity: 1, y: 0 } : {}}
                transition={{
                  duration: 0.9,
                  ease: [0.215, 0.61, 0.355, 1.0],
                  delay: 0.2,
                }}
              >
                {hero.description}
              </motion.p>

              {/* Register CTA button */}
              <motion.button
                className="mt-6 px-8 py-3.5 bg-[#0064FF] text-white font-semibold rounded-full hover:bg-blue-600 active:scale-95 transition-all text-[14px] cursor-pointer drop-shadow-lg border-none"
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
                onClick={() => window.location.href = '/login'}
                initial={{ opacity: 0, y: 20 }}
                animate={entranceComplete ? { opacity: 1, y: 0 } : {}}
                transition={{
                  duration: 0.9,
                  ease: [0.215, 0.61, 0.355, 1.0],
                  delay: 0.4,
                }}
              >
                지금 시작하기
              </motion.button>
            </div>

            {/* Right heading */}
            <h1
              className="text-white font-light leading-[0.95] tracking-[-0.03em] text-left md:text-right drop-shadow-lg"
              style={{ fontSize: 'clamp(40px, 8vw, 88px)', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
            >
              <ScrambleIn text={hero.titleRight[0]} delay={700} triggered={entranceComplete} />
              <br />
              <ScrambleIn text={hero.titleRight[1]} delay={1000} triggered={entranceComplete} />
            </h1>
          </div>
        </motion.div>
      </section>

      {/* ════════════════ SECTION 2: CINEMATIC TEXT ════════════════ */}
      <section
        ref={section2Ref}
        className="relative h-screen h-[100dvh] flex items-center justify-center overflow-hidden"
      >
        {/* Looping video background for receipt processing */}
        <video
          src="/receipt.mp4"
          poster="/receipt-bg.png"
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
        />

        {/* Top gradient overlay */}
        <div
          className="absolute top-0 left-0 right-0 z-10"
          style={{
            height: 180,
            background: 'linear-gradient(to bottom, #010103, transparent)',
          }}
        />

        {/* Adjusted light dark overlay for brightness */}
        <div className="absolute inset-0 bg-black/20 z-10" />

        {/* 3D text content */}
        <div className="relative z-20 max-w-5xl mx-auto" style={{ perspective: 400 }}>
          <motion.p
            className="font-sans font-normal text-[22px] sm:text-[30px] md:text-[36px] lg:text-[42px] text-white leading-[1.35] tracking-[-0.02em] select-none px-6 sm:px-12 text-center drop-shadow-lg"
            style={{
              transform: transform3D,
              opacity: textOpacity,
              textShadow: '0 2px 8px rgba(0,0,0,0.8)',
            }}
          >
            {cinematic.text}
          </motion.p>
        </div>
      </section>

      {/* ════════════════ SECTION 3: METRICS ════════════════ */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-black">
        {/* Bright cafe counter image background */}
        <img
          src="/cafe_counter_bright.png"
          className="absolute inset-0 w-full h-full object-cover"
          alt="Bright Cafe Counter Background"
        />

        {/* Adjusted light dark overlay for brightness */}
        <div className="absolute inset-0 bg-black/20 z-10" />

        <div className="relative z-20 pt-32 pb-32 px-6 max-w-6xl mx-auto w-full">
          <motion.p
            className="text-white/80 text-[13px] sm:text-[14px] tracking-[0.2em] uppercase mb-20 text-center drop-shadow-lg font-semibold"
            style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 1.2 }}
            viewport={{ once: true, amount: 0.3 }}
          >
            {metrics.subtitle}
          </motion.p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-16 md:gap-8 text-center">
            {metrics.items.map((m, i) => (
              <motion.div
                key={m.label}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: i * 0.15 }}
                viewport={{ once: true, amount: 0.3 }}
              >
                <div
                  className="text-white font-semibold tracking-[-0.04em] leading-none drop-shadow-lg"
                  style={{ fontSize: 'clamp(28px, 5vw, 56px)', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
                >
                  {m.value}
                </div>
                <div 
                  className="text-white/90 text-[13px] sm:text-[15px] mt-4 tracking-wide drop-shadow-lg font-medium"
                  style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
                >
                  {m.label}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════ SECTION 4: TECHNOLOGY ════════════════ */}
      <section className="relative min-h-[500px] flex flex-col justify-center overflow-hidden py-32">
        {/* Bright kitchen background image */}
        <img
          src="/restaurant_kitchen_bright.png"
          className="absolute inset-0 w-full h-full object-cover"
          alt="Bright Restaurant Kitchen Background"
        />

        {/* Adjusted light dark overlay for brightness */}
        <div className="absolute inset-0 bg-black/20 z-10" />

        <div className="relative z-20 flex flex-col px-8 sm:px-12 md:px-16 max-w-6xl mx-auto w-full">
          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-8">
            <motion.h2
              className="text-white font-semibold leading-[0.95] tracking-[-0.03em] drop-shadow-lg"
              style={{ fontSize: 'clamp(36px, 8vw, 72px)', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.0 }}
              viewport={{ once: true, amount: 0.3 }}
            >
              {technology.title[0]}
              <br />
              {technology.title[1]}
            </motion.h2>

            <motion.p
              className="text-white/90 text-[15px] sm:text-[17px] leading-relaxed max-w-sm md:text-right md:pt-4 drop-shadow-lg font-medium"
              style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.0, delay: 0.2 }}
              viewport={{ once: true, amount: 0.3 }}
            >
              {technology.description}
            </motion.p>
          </div>
        </div>
      </section>

      {/* ════════════════ SECTION 4B: INDEPENDENT FEATURES CARD GRID (WHITE THEME) ════════════════ */}
      <section className="bg-white py-24 px-6 md:px-12 relative z-20">
        <div className="max-w-6xl mx-auto">
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 1.0 }}
            viewport={{ once: true, amount: 0.2 }}
          >
            {technology.features.map((f, i) => (
              <motion.div
                key={f.title}
                className="bg-white border border-zinc-200 p-8 rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col gap-3"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                viewport={{ once: true, amount: 0.2 }}
              >
                <h3 className="text-zinc-900 text-[17px] sm:text-[19px] font-bold tracking-tight">
                  {f.title}
                </h3>
                <p className="text-zinc-600 text-[14px] sm:text-[15px] leading-relaxed font-normal">
                  {f.desc}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ════════════════ SECTION 5: ARCHITECTURE ════════════════ */}
      <section className="relative min-h-screen flex items-center justify-center bg-black overflow-hidden py-32">
        {/* App background image */}
        <img
          src="/phone_app_bright.png"
          className="absolute inset-0 w-full h-full object-cover"
          alt="App Background"
        />

        {/* Adjusted dark overlay to highlight phone mockup */}
        <div className="absolute inset-0 bg-black/40 z-10" />

        <div className="relative z-20 max-w-6xl mx-auto px-6 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left Column: Text & Steps */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 1.0 }}
              viewport={{ once: true, amount: 0.3 }}
            >
              <p 
                className="text-white/80 text-[13px] sm:text-[14px] tracking-[0.2em] uppercase mb-6 drop-shadow-lg font-semibold"
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
              >
                {architecture.subtitle}
              </p>
              <h2
                className="text-white font-semibold leading-[1.15] tracking-[-0.02em] mb-8 drop-shadow-lg"
                style={{ fontSize: 'clamp(28px, 5vw, 52px)', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
              >
                {architecture.heading}
              </h2>
              <p 
                className="text-white/90 text-[15px] sm:text-[17px] leading-relaxed max-w-xl mb-12 drop-shadow-lg font-medium"
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
              >
                {architecture.description}
              </p>

              {/* 1단계 / 2단계 / 3단계 List */}
              <div className="flex flex-col gap-4 max-w-md">
                {architecture.layers.map((l) => (
                  <div
                    key={l.num}
                    className="w-full h-[72px] border border-white/20 bg-black/25 backdrop-blur-md rounded-lg flex items-center justify-between px-6 drop-shadow-lg"
                  >
                    <span className="text-white/80 text-[13px] tracking-[0.1em] font-semibold">
                      {l.num}단계
                    </span>
                    <span className="text-white text-[15px] sm:text-[17px] font-semibold">
                      {l.name}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Right Column: Phone Mockup Frame */}
            <motion.div
              className="flex justify-center"
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 1.0, delay: 0.2 }}
              viewport={{ once: true, amount: 0.3 }}
            >
              {/* Premium Phone Frame */}
              <div className="relative w-[260px] h-[530px] bg-zinc-900 rounded-[44px] p-3 border-4 border-zinc-700 shadow-2xl overflow-hidden shrink-0">
                {/* Speaker/Camera Notch */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-4 bg-zinc-800 rounded-full z-30" />
                
                {/* Screen */}
                <div className="w-full h-full rounded-[32px] overflow-hidden relative bg-black">
                  <img
                    src="/dashboard.jpg"
                    className="w-full h-full object-cover"
                    alt="매장닥터 대시보드 화면"
                  />
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ════════════════ SECTION 6: PRICING ════════════════ */}
      <section className="relative min-h-screen bg-black py-32 px-6 overflow-hidden">
        {/* Bright store front image background */}
        <img
          src="/store_front_bright.png"
          className="absolute inset-0 w-full h-full object-cover"
          alt="Bright Storefront Background"
        />

        {/* Adjusted dark overlay for better pricing text contrast */}
        <div className="absolute inset-0 bg-black/50 z-10" />

        <div className="relative z-20 max-w-6xl mx-auto">
          <motion.div
            className="text-center mb-20"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.0 }}
            viewport={{ once: true, amount: 0.3 }}
          >
            <p 
              className="text-white/80 text-[13px] sm:text-[14px] tracking-[0.2em] uppercase mb-8 drop-shadow-lg font-semibold"
              style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
            >
              요금제 안내
            </p>
            <h2
              className="text-white font-semibold leading-[1.15] tracking-[-0.02em] mb-6 drop-shadow-lg"
              style={{ fontSize: 'clamp(24px, 5vw, 44px)', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
            >
              매장닥터 플랜 선택
            </h2>
            <p 
              className="text-white/95 text-[15px] sm:text-[17px] leading-relaxed max-w-xl mx-auto drop-shadow-lg font-medium"
              style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
            >
              사장님의 매장 규모와 필요 기능에 맞춰 가장 효율적인 플랜을 선택하세요.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {/* ── Basic ── */}
            <motion.div
              className="border border-white/20 bg-black/75 backdrop-blur-md rounded-2xl p-6 sm:p-8 flex flex-col relative drop-shadow-lg"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0 }}
              viewport={{ once: true, amount: 0.3 }}
            >
              <p 
                className="text-white/80 text-[12px] tracking-[0.15em] uppercase mb-3 font-semibold"
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
              >
                Basic
              </p>
              <div className="flex items-baseline gap-1 mb-2 whitespace-nowrap">
                <span 
                  className="text-white text-[32px] sm:text-[38px] font-semibold tracking-tight"
                  style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
                >
                  9,900원
                </span>
                <span className="text-white/80 text-[12px] sm:text-[14px]">/월</span>
              </div>
              <p 
                className="text-white/95 text-[13px] leading-relaxed mb-8 font-medium drop-shadow-lg"
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
              >
                매장 1개, OCR 월 100건
              </p>
              <ul className="flex flex-col gap-3 mb-10 flex-1">
                <li className="flex items-center gap-3 text-white/90 text-[13px] font-medium drop-shadow-lg" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
                  <span className="text-[#0064FF] font-bold">✓</span> 영수증/POS 사진 분석
                </li>
                <li className="flex items-center gap-3 text-white/90 text-[13px] font-medium drop-shadow-lg" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
                  <span className="text-[#0064FF] font-bold">✓</span> 기초 매출·매입 장부 자동화
                </li>
                <li className="flex items-center gap-3 text-white/90 text-[13px] font-medium drop-shadow-lg" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
                  <span className="text-[#0064FF] font-bold">✓</span> 월간 기본 정산서 제공
                </li>
              </ul>
              <button
                onClick={() => window.location.href = '/login'}
                className="w-full h-[50px] rounded-lg font-semibold text-[15px] flex items-center justify-center gap-2 bg-[#0064FF] hover:bg-blue-600 text-white border-none active:scale-[0.98] transition-all cursor-pointer drop-shadow-lg"
              >
                선택하기
              </button>
            </motion.div>

            {/* ── Pro (Featured) ── */}
            <motion.div
              className="border border-[#0064FF]/60 bg-black/80 backdrop-blur-md rounded-2xl p-6 sm:p-8 flex flex-col relative drop-shadow-xl"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
              viewport={{ once: true, amount: 0.3 }}
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <span className="bg-[#0064FF] text-white text-[11px] font-bold tracking-[0.1em] uppercase px-4 py-1.5 rounded-full drop-shadow-md">
                  Most Popular
                </span>
              </div>
              <p 
                className="text-white/80 text-[12px] tracking-[0.15em] uppercase mb-3 font-semibold"
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
              >
                Pro
              </p>
              <div className="flex items-baseline gap-1 mb-2 whitespace-nowrap">
                <span 
                  className="text-white text-[32px] sm:text-[38px] font-semibold tracking-tight"
                  style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
                >
                  19,900원
                </span>
                <span className="text-white/80 text-[12px] sm:text-[14px]">/월</span>
              </div>
              <p 
                className="text-white/95 text-[13px] leading-relaxed mb-8 font-medium drop-shadow-lg"
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
              >
                매장 1개, OCR 월 300건 + AI 진단
              </p>
              <ul className="flex flex-col gap-3 mb-10 flex-1">
                <li className="flex items-center gap-3 text-white/90 text-[13px] font-medium drop-shadow-lg" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
                  <span className="text-[#0064FF] font-bold">✓</span> Basic의 모든 기능 제공
                </li>
                <li className="flex items-center gap-3 text-white/90 text-[13px] font-medium drop-shadow-lg" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
                  <span className="text-[#0064FF] font-bold">✓</span> AI 영업 진단 분석
                </li>
                <li className="flex items-center gap-3 text-white/90 text-[13px] font-medium drop-shadow-lg" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
                  <span className="text-[#0064FF] font-bold">✓</span> 실시간 원가율 및 마진 추적
                </li>
                <li className="flex items-center gap-3 text-white/90 text-[13px] font-medium drop-shadow-lg" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
                  <span className="text-[#0064FF] font-bold">✓</span> 다음 달 예측 분석 보고서
                </li>
              </ul>
              <button
                onClick={() => window.location.href = '/login'}
                className="w-full h-[50px] rounded-lg font-semibold text-[15px] flex items-center justify-center gap-2 bg-[#0064FF] hover:bg-blue-600 text-white border-none active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-blue-500/20 drop-shadow-lg"
              >
                선택하기
              </button>
            </motion.div>

            {/* ── Premium ── */}
            <motion.div
              className="border border-white/20 bg-black/75 backdrop-blur-md rounded-2xl p-6 sm:p-8 flex flex-col relative drop-shadow-lg"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              viewport={{ once: true, amount: 0.3 }}
            >
              <p 
                className="text-white/80 text-[12px] tracking-[0.15em] uppercase mb-3 font-semibold"
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
              >
                Premium
              </p>
              <div className="flex items-baseline gap-1 mb-2 whitespace-nowrap">
                <span 
                  className="text-white text-[32px] sm:text-[38px] font-semibold tracking-tight"
                  style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
                >
                  29,900원
                </span>
                <span className="text-white/80 text-[12px] sm:text-[14px]">/월</span>
              </div>
              <p 
                className="text-white/95 text-[13px] leading-relaxed mb-8 font-medium drop-shadow-lg"
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
              >
                매장 1개, OCR 월 1,000건 + 전체 기능
              </p>
              <ul className="flex flex-col gap-3 mb-10 flex-1">
                <li className="flex items-center gap-3 text-white/90 text-[13px] font-medium drop-shadow-lg" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
                  <span className="text-[#0064FF] font-bold">✓</span> Pro의 모든 기능 제공
                </li>
                <li className="flex items-center gap-3 text-white/90 text-[13px] font-medium drop-shadow-lg" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
                  <span className="text-[#0064FF] font-bold">✓</span> 대용량 영수증 우선 파싱
                </li>
                <li className="flex items-center gap-3 text-white/90 text-[13px] font-medium drop-shadow-lg" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
                  <span className="text-[#0064FF] font-bold">✓</span> 무제한 데이터 보존 기능
                </li>
              </ul>
              <button
                onClick={() => window.location.href = '/login'}
                className="w-full h-[50px] rounded-lg font-semibold text-[15px] flex items-center justify-center gap-2 bg-[#0064FF] hover:bg-blue-600 text-white border-none active:scale-[0.98] transition-all cursor-pointer drop-shadow-lg"
              >
                선택하기
              </button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ════════════════ FOOTER ════════════════ */}
      <footer className="bg-black overflow-hidden border-t border-white/10 relative z-20">
        <div className="flex flex-col md:flex-row min-h-[400px]">
          {/* Left: Food Preparation Image */}
          <div className="md:w-1/2 h-[300px] md:h-auto relative">
            <img
              src="/food_prep_bright.png"
              className="absolute inset-0 w-full h-full object-cover opacity-60"
              alt="Bright Culinary Plating Food Background"
            />
            <div className="absolute inset-0 bg-black/20" />
          </div>

          {/* Right: Content with Smiling Owner Background */}
          <div className="md:w-1/2 flex flex-col justify-between p-10 sm:p-16 relative overflow-hidden bg-black/50">
            {/* Blended background owner image */}
            <img
              src="/owner_smiling_bright.png"
              className="absolute inset-0 w-full h-full object-cover opacity-15"
              alt="Smiling Owner Background"
            />
            <div className="absolute inset-0 bg-black/35 z-10" />

            <div className="relative z-20 flex flex-col justify-between h-full flex-1">
              <div>
                <div className="flex items-center gap-2.5 mb-8">
                  <ConnectAILabLogo size={18} className="text-white/80" />
                  <span 
                    className="text-[16px] font-medium text-white/85 tracking-tight drop-shadow-lg"
                    style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
                  >
                    {SITE_CONFIG.brandName}
                  </span>
                </div>
                <p 
                  className="text-white/80 text-[14px] sm:text-[15px] leading-relaxed max-w-sm drop-shadow-lg font-medium"
                  style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
                >
                  {footer.tagline}
                </p>
              </div>

              <p 
                className="text-white/40 text-[12px] mt-12 drop-shadow-sm font-semibold"
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
              >
                {SITE_CONFIG.copyright}
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
