'use client';

import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="space-y-8 max-w-4xl mx-auto py-6">
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          CashReady
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Stellar Testnet cash-out reservation and escrow settlement. Pick up simulated cash at local agents with guaranteed on-chain payout delivery.
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            Native XLM
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            Circle Testnet USDC
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
            Rust Soroban Escrow
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            Atomic Inventory Concurrency
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        {/* Recipient Card */}
        <div className="border border-slate-200 rounded-xl bg-white p-6 shadow-sm flex flex-col justify-between hover:border-blue-400 transition">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xl">
              1
            </div>
            <h2 className="text-xl font-bold text-slate-900">Recipient Portal</h2>
            <p className="text-sm text-slate-600">
              Select a town, pick an active cash agent, request a hold on a funded remittance, receive a 6-digit OTP, and acknowledge receipt.
            </p>
          </div>
          <Link
            href="/recipient"
            className="mt-6 inline-block w-full text-center bg-blue-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700 transition"
          >
            Open Recipient View →
          </Link>
        </div>

        {/* Agent Card */}
        <div className="border border-slate-200 rounded-xl bg-white p-6 shadow-sm flex flex-col justify-between hover:border-emerald-400 transition">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xl">
              2
            </div>
            <h2 className="text-xl font-bold text-slate-900">Agent Desk</h2>
            <p className="text-sm text-slate-600">
              Agent dashboard for Cebu Central (Happy Path) or Manila (Low Cash). Accept holds with atomic inventory lock, verify PIN, and attest cash handover.
            </p>
          </div>
          <Link
            href="/agent"
            className="mt-6 inline-block w-full text-center bg-emerald-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-emerald-700 transition"
          >
            Open Agent Desk →
          </Link>
        </div>

        {/* Operator Card */}
        <div className="border border-slate-200 rounded-xl bg-white p-6 shadow-sm flex flex-col justify-between hover:border-indigo-400 transition">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xl">
              3
            </div>
            <h2 className="text-xl font-bold text-slate-900">Operator Console</h2>
            <p className="text-sm text-slate-600">
              Independent settlement authority. View fulfilled physical pickups and trigger Soroban release of escrowed XLM/USDC to fulfilling agent.
            </p>
          </div>
          <Link
            href="/operator"
            className="mt-6 inline-block w-full text-center bg-indigo-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-indigo-700 transition"
          >
            Open Operator Console →
          </Link>
        </div>
      </div>

      <div className="bg-slate-100 rounded-xl p-6 border border-slate-200 space-y-4">
        <h3 className="font-bold text-slate-900 flex items-center space-x-2">
          <span>🔒 Architecture & Safety Principles</span>
        </h3>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-600">
          <li className="flex items-start space-x-2">
            <span className="text-emerald-500 font-bold">✓</span>
            <span><strong>Decoupled State:</strong> Expired holds release only DB inventory, never on-chain funds.</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="text-emerald-500 font-bold">✓</span>
            <span><strong>Deferred Agent Destination:</strong> Agent wallet is designated at release, not at funding.</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="text-emerald-500 font-bold">✓</span>
            <span><strong>Atomic Hold Guarantee:</strong> PostgreSQL conditional updates prevent concurrency overdraws.</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="text-emerald-500 font-bold">✓</span>
            <span><strong>Zero Raw PIN Storage:</strong> Only HMAC-SHA256 hashes are saved; constant-time check.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
