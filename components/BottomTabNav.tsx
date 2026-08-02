'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function BottomTabNav() {
  const pathname = usePathname();

  const tabs = [
    { href: '/dashboard', label: '홈', icon: '📊', active: pathname === '/dashboard' },
    { href: '/sales', label: '매출', icon: '📈', active: pathname === '/sales' },
    { href: '/purchases', label: '매입', icon: '📦', active: pathname === '/purchases' },
    { href: '/analytics/menu', label: '분석', icon: '🍽️', active: pathname.startsWith('/analytics') },
    { href: '/chat', label: 'AI상담', icon: '🤖', active: pathname === '/chat' },
    { href: '/settings', label: '설정', icon: '⚙️', active: pathname === '/settings' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-800 bg-slate-900/95 backdrop-blur">
      <div className="mx-auto max-w-2xl grid grid-cols-6">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-col items-center justify-center py-4 px-2 transition ${
              tab.active ? 'text-sky-400 border-t-2 border-sky-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="text-2xl">{tab.icon}</span>
            <span className="mt-1 text-xs font-medium">{tab.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
