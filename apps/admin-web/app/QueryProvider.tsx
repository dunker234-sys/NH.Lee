'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

/** TECH_STACK.md가 지정한 스택(TanStack Query)을 지금부터 세팅해 둔다 —
 * 이 최소 부트스트랩은 캐싱이 거의 필요 없지만, STEP6이 admin-web을 본격
 * 확장할 때 이 provider를 다시 만들 필요가 없게 한다. */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
