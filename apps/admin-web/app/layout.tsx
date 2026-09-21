import type { Metadata } from 'next';
import './globals.css';
import { QueryProvider } from './QueryProvider';

export const metadata: Metadata = {
  title: '근태관리 관리자',
  description: '전사 근태관리 시스템 관리자 웹',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full bg-slate-50 text-slate-900 antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
