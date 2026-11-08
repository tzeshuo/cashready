import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import ResetDemoButton from '@/components/ResetDemoButton';

export const metadata: Metadata = {
  title: 'CashReady — Stellar Testnet Cash-Out Reservation',
  description: 'Lean engineering prototype for Stellar Blockchain Innovation Challenge showcase',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        <header className="border-b border-slate-200 bg-white sticky top-0 z-50 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Link href="/" className="font-bold text-xl tracking-tight text-blue-600 flex items-center space-x-2">
                <span>⚡ CashReady</span>
              </Link>
              <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-mono font-medium">
                Stellar Testnet Only
              </span>
            </div>

            <nav className="flex items-center space-x-1 sm:space-x-2 text-sm">
              <Link
                href="/recipient"
                className="px-3 py-1.5 rounded-md hover:bg-slate-100 font-medium text-slate-700 transition"
              >
                Recipient Portal
              </Link>
              <Link
                href="/agent"
                className="px-3 py-1.5 rounded-md hover:bg-slate-100 font-medium text-slate-700 transition"
              >
                Agent Desk
              </Link>
              <Link
                href="/operator"
                className="px-3 py-1.5 rounded-md hover:bg-slate-100 font-medium text-slate-700 transition"
              >
                Operator Admin
              </Link>
              <ResetDemoButton />
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6">{children}</main>

        <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
          <p>
            CashReady Hackathon Prototype • 100% Stellar Testnet • Simulated PHP Cash Notes • No Real Remittance Provider
          </p>
        </footer>
      </body>
    </html>
  );
}
