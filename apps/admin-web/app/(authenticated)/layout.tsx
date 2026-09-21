'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/apiClient';
import { authStore, StoredSession } from '../../lib/authStore';

interface SessionPrincipal {
  employeeId: string;
  employeeNo: string;
  role: string;
  status: string;
}

const NAV_ITEMS = [
  { href: '/dashboard', label: '대시보드' },
  { href: '/punch', label: 'PC 타각' },
  { href: '/schedule', label: '편성' },
  { href: '/schedule/shift-templates', label: '교대 패턴' },
  { href: '/schedule/reports', label: '리포트' },
  { href: '/migration', label: '개시 데이터 이관' },
];

/** 이 그룹 아래 모든 페이지가 공유하는 인증 앱 셸(사이드바+세션 가드).
 * STEP5-B는 로그인+타각 위젯뿐이라 셸이 없었다 — 이번이 admin-web
 * 최초의 "실제 규모" 레이아웃이다. */
export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<StoredSession | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const s = authStore.get();
    if (!s) {
      router.replace('/login');
      return;
    }
    setSession(s);
    setChecked(true);
  }, [router]);

  const principalQuery = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: () => apiFetch<{ principal: SessionPrincipal }>('/auth/session'),
    enabled: checked,
    staleTime: 5 * 60 * 1000,
  });

  if (!checked || !session) return null;

  const role = principalQuery.data?.principal.role;

  function handleLogout() {
    authStore.clear();
    router.replace('/login');
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white p-4">
        <p className="mb-6 text-sm font-semibold text-slate-500">근태관리 관리자</p>
        <nav className="flex-1 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || (item.href !== '/punch' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm ${active ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 pt-4 text-xs text-slate-500">
          <p>
            {session.employeeNo}
            {role ? ` · ${role}` : ''}
          </p>
          <button type="button" onClick={handleLogout} className="mt-2 underline">
            로그아웃
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto p-8">{children}</main>
    </div>
  );
}
