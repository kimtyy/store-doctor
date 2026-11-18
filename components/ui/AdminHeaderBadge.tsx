'use client';

import { useEffect, useState } from 'react';

export default function AdminHeaderBadge() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/me/role')
      .then((r) => r.json())
      .then((d) => {
        if (active && d?.isAdmin) {
          setIsAdmin(true);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!isAdmin) return null;

  return (
    <a
      href="/admin"
      className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-600/90 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-500 transition print:hidden shrink-0"
    >
      👑 관리자
    </a>
  );
}
