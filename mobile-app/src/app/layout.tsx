import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { RelayProvider } from '@/context/RelayContext';
import { NewsProvider } from '@/context/NewsContext';
import { BottomNav } from '@/components/BottomNav';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Claude Code Mobile',
  description: 'Access Claude Code from your mobile device',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Claude Code',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#111827',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <RelayProvider>
          <NewsProvider>
            {children}
            <BottomNav />
          </NewsProvider>
        </RelayProvider>
      </body>
    </html>
  );
}
