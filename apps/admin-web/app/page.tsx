'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authStore } from '../lib/authStore';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(authStore.get() ? '/schedule' : '/login');
  }, [router]);

  return null;
}
