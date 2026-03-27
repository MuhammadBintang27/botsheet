import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Slot Bot Control Panel',
  description: 'Competitive scheduler and Google Sheets updater'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
