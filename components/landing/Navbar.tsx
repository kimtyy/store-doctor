'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConnectAILabLogo } from './ConnectAILabLogo';
import { SquashHamburger } from './SquashHamburger';
import { ScrambleText } from './ScrambleText';
import { SITE_CONFIG } from '../../config/landingContent';
import { createClient } from '@/utils/supabase/client';

interface NavbarProps {
  entranceComplete: boolean;
}

export function Navbar({ entranceComplete }: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [downloadHovered, setDownloadHovered] = useState(false);
  const [aboutHovered, setAboutHovered] = useState(false);
  const [metricsHovered, setMetricsHovered] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });
  }, []);

  const scrollTo = (y: number) => {
    window.scrollTo({ top: y, behavior: 'smooth' });
    setMenuOpen(false);
  };

  return (
    <>
      <motion.nav
        className="fixed top-0 left-0 right-0 z-50 h-20 flex items-center px-4 sm:px-6 md:px-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: entranceComplete ? 1 : 0 }}
        transition={{ duration: 0.8 }}
      >
        {/* ===== DESKTOP ===== */}
        <div className="hidden sm:flex items-center justify-between w-full">
          {/* Left group */}
          <div className="flex items-center gap-2">
            {/* Logo pill */}
            <motion.div
              className={`h-12 px-5 bg-white/15 backdrop-blur-md rounded-[14px] flex items-center gap-2.5 cursor-pointer ${
                menuOpen ? 'hidden md:flex' : 'flex'
              }`}
              whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.22)' }}
              whileTap={{ scale: 0.98 }}
            >
              <ConnectAILabLogo size={18} className="text-white" />
              <span className="text-[16px] font-medium tracking-tight text-white">
                {SITE_CONFIG.brandName}
              </span>
            </motion.div>

            {/* Expanding menu pill */}
            <motion.div
              className="h-12 rounded-[14px] bg-white/15 backdrop-blur-md flex items-center overflow-hidden"
              animate={{ width: menuOpen ? 290 : 48 }}
              transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            >
              {/* Hamburger button */}
              <motion.button
                className="flex items-center justify-center shrink-0 cursor-pointer"
                style={{
                  width: menuOpen ? 36 : 48,
                  height: menuOpen ? 36 : 48,
                  borderRadius: menuOpen ? 11 : 14,
                  backgroundColor: menuOpen ? 'rgba(255,255,255,0.1)' : 'transparent',
                  marginLeft: menuOpen ? 6 : 0,
                }}
                onClick={() => setMenuOpen(!menuOpen)}
                whileHover={{ backgroundColor: menuOpen ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)' }}
              >
                <SquashHamburger isOpen={menuOpen} />
              </motion.button>

              {/* Nav links */}
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    className="flex items-center gap-6 ml-4 whitespace-nowrap"
                    initial={{ opacity: 0, x: 15 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 15 }}
                    transition={{ duration: 0.25 }}
                  >
                    <button
                      className="text-[16px] font-normal text-white/85 hover:text-white transition-colors cursor-pointer bg-transparent border-none"
                      onMouseEnter={() => setAboutHovered(true)}
                      onMouseLeave={() => setAboutHovered(false)}
                      onClick={() => scrollTo(window.innerHeight)}
                    >
                      <ScrambleText text="소개" isHovered={aboutHovered} />
                    </button>
                    <button
                      className="text-[16px] font-normal text-white/85 hover:text-white transition-colors cursor-pointer bg-transparent border-none"
                      onMouseEnter={() => setMetricsHovered(true)}
                      onMouseLeave={() => setMetricsHovered(false)}
                      onClick={() => scrollTo(window.innerHeight * 2)}
                    >
                      <ScrambleText text="주요 지표" isHovered={metricsHovered} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>

          {/* Right buttons */}
          <div className="flex items-center gap-2">
            {!isLoggedIn && (
              <motion.button
                className="h-12 px-5 bg-white/10 backdrop-blur-md rounded-[14px] flex items-center gap-2 cursor-pointer border-none text-white/85 text-[15px] font-medium hover:bg-white/20 transition-colors"
                whileTap={{ scale: 0.97 }}
                onClick={() => window.location.href = '/login'}
              >
                로그인
              </motion.button>
            )}

            {/* Start App button */}
            <motion.button
              onClick={() => window.location.href = isLoggedIn ? '/dashboard' : '/login'}
              className="h-12 px-6 bg-white rounded-full flex items-center gap-2.5 cursor-pointer border-none"
              whileHover={{ scale: 1.03, backgroundColor: '#e2e2e6' }}
              whileTap={{ scale: 0.97 }}
              onMouseEnter={() => setDownloadHovered(true)}
              onMouseLeave={() => setDownloadHovered(false)}
            >
              <i className="bi bi-play-circle text-black text-[16px]" />
              <span className="text-black text-[16px] font-medium">
                <ScrambleText text={isLoggedIn ? '대시보드로 이동' : '지금 시작하기'} isHovered={downloadHovered} />
              </span>
            </motion.button>
          </div>
        </div>

        {/* ===== MOBILE ===== */}
        <div className="flex sm:hidden items-center justify-between w-full">
          {/* Left group */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {/* Logo pill (collapses when menu open) */}
            <motion.div
              className="h-9 px-3 bg-white/15 backdrop-blur-md rounded-[10px] flex items-center gap-2 overflow-hidden shrink-0"
              animate={{ width: menuOpen ? 0 : 'auto', opacity: menuOpen ? 0 : 1, paddingLeft: menuOpen ? 0 : 12, paddingRight: menuOpen ? 0 : 12 }}
              transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            >
              <ConnectAILabLogo size={14} className="text-white shrink-0" />
              <span className="text-[13px] font-medium tracking-tight text-white whitespace-nowrap">
                {SITE_CONFIG.brandName}
              </span>
            </motion.div>

            {/* Expanding menu capsule */}
            <motion.div
              className="h-9 rounded-[10px] bg-white/15 backdrop-blur-md flex items-center overflow-hidden"
              animate={{ width: menuOpen ? '100%' : 36 }}
              transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            >
              <motion.button
                className="flex items-center justify-center shrink-0 cursor-pointer"
                style={{
                  width: menuOpen ? 30 : 36,
                  height: menuOpen ? 30 : 36,
                  borderRadius: menuOpen ? 8 : 10,
                  backgroundColor: menuOpen ? 'rgba(255,255,255,0.1)' : 'transparent',
                  marginLeft: menuOpen ? 4 : 0,
                }}
                onClick={() => setMenuOpen(!menuOpen)}
              >
                <SquashHamburger isOpen={menuOpen} isMobile />
              </motion.button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    className="flex items-center gap-4 ml-3 whitespace-nowrap"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <button
                      className="text-[13px] font-normal text-white/85 cursor-pointer bg-transparent border-none"
                      onClick={() => scrollTo(window.innerHeight)}
                    >
                      소개
                    </button>
                    <button
                      className="text-[13px] font-normal text-white/85 cursor-pointer bg-transparent border-none"
                      onClick={() => scrollTo(window.innerHeight * 2)}
                    >
                      주요 지표
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>

          {/* Right buttons */}
          <div className="flex items-center gap-1.5 ml-2">
            {!isLoggedIn && (
              <motion.button
                className="h-9 px-3 bg-white/15 backdrop-blur-md rounded-[10px] flex items-center cursor-pointer border-none text-white/85 text-[12px] font-medium"
                whileTap={{ scale: 0.95 }}
                onClick={() => window.location.href = '/login'}
              >
                로그인
              </motion.button>
            )}

            {/* Start App button */}
            <motion.button
              onClick={() => window.location.href = isLoggedIn ? '/dashboard' : '/login'}
              className="h-9 px-3.5 bg-white rounded-full flex items-center gap-1.5 cursor-pointer border-none shrink-0"
              whileTap={{ scale: 0.95 }}
            >
              <i className="bi bi-play-circle text-black text-[13px]" />
              <span className="text-black text-[13px] font-medium">
                {isLoggedIn ? '대시보드로 이동' : '지금 시작하기'}
              </span>
            </motion.button>
          </div>
        </div>
      </motion.nav>
    </>
  );
}
