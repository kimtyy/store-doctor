import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { createClient } from '@/utils/supabase/server';
import './globals.css';

export const metadata: Metadata = {
  title: '매장닥터',
  description: '매출과 매입을 합쳐 손익 진단을 도와주는 앱',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '매장닥터',
  },
  icons: {
    icon: [
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' }],
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAdmin = !!user?.email && user.email === process.env.ADMIN_EMAIL;
  return (
    <html lang="ko">
      <head>
        <meta name="theme-color" content="#0f172a" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="매장닥터" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" />
      </head>
      <body className="bg-slate-950 text-slate-100">
        {children}
        {isAdmin && (
          <a
            href="/admin"
            className="fixed top-3 right-4 z-50 bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg backdrop-blur transition border border-rose-500/50"
          >
            👑 관리자
          </a>
        )}
      </body>
    </html>
  );
}
