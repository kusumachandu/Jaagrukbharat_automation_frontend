import type { Metadata } from 'next';
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { RailNav } from '@/components/RailNav';
import { AttentionAlert } from '@/components/AttentionAlert';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  weight: ['500', '600', '700'],
});
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jbMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jbmono' });

export const metadata: Metadata = {
  title: 'AutoFlow — browser automation',
  description: 'Wire up browser automations and watch them run.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable} ${jbMono.variable}`}>
      <body>
        <AuthProvider>
          <AttentionAlert />
          <div className="flex h-screen overflow-hidden">
            <RailNav />
            <main className="flex-1 min-w-0 h-screen overflow-y-auto">{children}</main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
