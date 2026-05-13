import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: '매장닥터',
  description: '매출과 매입을 합쳐 손익 진단을 도와주는 앱',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-slate-950 text-slate-100">{children}</body>
    </html>
  );
}
