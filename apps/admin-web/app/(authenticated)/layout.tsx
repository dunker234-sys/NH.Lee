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
  { href: '/schedule', label: '근무스케쥴(계획)' },
  { href: '/schedule/shift-templates', label: '근무스케쥴(등록)' },
  { href: '/schedule/reports', label: '근무스케쥴(실적)' },
  { href: '/approval/dispatch', label: '외근·출장 승인', roles: ['SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN'] },
  { href: '/leave/requests', label: '연차·휴가 승인', roles: ['SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN'] },
  { href: '/leave/batches', label: '연차 배치 관리', roles: ['SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN'] },
  { href: '/leave/types', label: '휴가 유형 관리', roles: ['HQ_HR', 'ADMIN'] },
  { href: '/payroll-close', label: '급여 마감', roles: ['SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN'] },
  { href: '/compliance-reports', label: '컴플라이언스 리포트', roles: ['SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN'] },
  { href: '/hr-sync', label: '인사연동', roles: ['HQ_HR', 'ADMIN'] },
  { href: '/hr-sync/partners', label: '협력업체 관리', roles: ['HQ_HR', 'ADMIN'] },
  { href: '/correction/admin-direct', label: '직권 정정', roles: ['ADMIN'] },
  { href: '/kiosk-devices', label: '키오스크 기기 관리', roles: ['SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN'] },
  { href: '/audit-log', label: '감사 로그', roles: ['ADMIN'] },
  { href: '/ops-monitoring', label: '운영 모니터링', roles: ['ADMIN'] },
  { href: '/employees/protected-status', label: '보호 상태 등록', roles: ['ADMIN'] },
];

/** PARTNER 역할은 위 전체 관리자 네비게이션 대신 이 최소 셸만 본다(수정사항:
 * 협력업체 관리자 등록). roles 없는 항목(대시보드/PC타각/근무스케쥴 등)은
 * "인증된 모두"에게 보이는 기존 필터 규칙상 PARTNER에게도 노출돼버리므로,
 * 기존 NAV_ITEMS를 그대로 재사용하지 않고 별도 배열로 완전히 분리한다. */
const PARTNER_NAV_ITEMS = [{ href: '/partner/employees', label: '소속 직원 현황' }];

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
    // localStorage는 브라우저에서만 읽을 수 있어 SSR/하이드레이션 불일치를 피하려면
    // 마운트 후 effect에서 읽어야 한다 — 의도된 패턴이다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(s);
    setChecked(true);
  }, [router]);

  const principalQuery = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: () => apiFetch<{ principal: SessionPrincipal }>('/auth/session'),
    enabled: checked,
    staleTime: 5 * 60 * 1000,
  });

  const role = principalQuery.data?.principal.role;
  const isPartner = role === 'PARTNER';

  useEffect(() => {
    if (isPartner && !pathname.startsWith('/partner')) {
      router.replace('/partner/employees');
    }
  }, [isPartner, pathname, router]);

  if (!checked || !session) return null;

  function handleLogout() {
    authStore.clear();
    router.replace('/login');
  }

  const navItems = isPartner ? PARTNER_NAV_ITEMS : NAV_ITEMS.filter((item) => !item.roles || (role && item.roles.includes(role)));

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white p-4 print:hidden">
        <p className="mb-6 text-sm font-semibold text-slate-500">근태관리 관리자</p>
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
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
      <main className="flex-1 overflow-x-auto p-8 print:p-0">{children}</main>
    </div>
  );
}
