import type { Metadata, Viewport } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Share_Tech_Mono, VT323 } from 'next/font/google';
import '../index.css';

const shareTechMono = Share_Tech_Mono({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-share-tech-mono',
});

const vt323 = VT323({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-vt323',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#050508',
};

export const metadata: Metadata = {
  title: 'DOOM-DAW // IRKEN LABS',
  description:
    'DOOM DAW - IRKEN Audio Lab. AI-powered cyberpunk digital audio workstation. Generate beats, sequence synths, and create music in the browser.',
  openGraph: {
    title: 'DOOM DAW - IRKEN Audio Lab',
    description:
      'AI-powered cyberpunk DAW. Generate beats, sequence synths, create music in the browser.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${shareTechMono.variable} ${vt323.variable}`}>
        <body>
          {children}
          <SpeedInsights />
          <Analytics />
          <div className="scanlines" />
          <div className="crt-flicker" />
          <div className="bg-grid" />
        </body>
      </html>
    </ClerkProvider>
  );
}
