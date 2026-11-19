import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/AppShell';
import { FeedbackProvider } from '@/components/feedback';

export const metadata: Metadata = {
  title: 'Creator Studio AI',
  description: 'Mobile AI YouTube production studio: script, storyboard, images, voice, subtitles, automatic edit and MP4 render.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Creator Studio AI',
  appleWebApp: { capable: true, title: 'Creator Studio', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#06070c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="preload" href="/fonts/Montserrat-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        <FeedbackProvider>
          <AppShell>{children}</AppShell>
        </FeedbackProvider>
      </body>
    </html>
  );
}
