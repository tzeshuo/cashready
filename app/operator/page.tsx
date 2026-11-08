'use client';

import { useState, useEffect } from 'react';

export default function OperatorPage() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPayoutId, setSelectedPayoutId] = useState<string>('');
  const [agentWallet, setAgentWallet] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    fetchPayouts();
  }, []);

  async function fetchPayouts() {
    setLoading(true);
    try {
      const res = await fetch('/api/payouts', {
        headers: { 'x-demo-role': 'operator' },
      });
      const data = await res.json();
      if (res.ok) {
        setPayouts(data.payouts || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleReleaseSettlement(payoutId: string, wallet: string) {
    if (!wallet) {
      setErrorMessage('Please provide a destination Stellar G... agent wallet address.');
      return;
    }

    setErrorMessage('');
    setStatusMessage(`Submitting authorized release on Stellar Testnet for Payout ${payoutId}...`);

    try {
      const res = await fetch(`/api/settlements/${payoutId}/release`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-role': 'operator',
        },
        body: JSON.stringify({ agentWallet: wallet }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Settlement release failed');
      }

      setStatusMessage(`✓ Settlement Successfully Released! Tx: ${data.txHash}`);
      await fetchPayouts();
    } catch (err: any) {
      setErrorMessage(err.message);
      setStatusMessage('');
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">Operator Settlement Console</h1>
        <p className="text-sm text-slate-600">
          Independent settlement authority. Inspect physically fulfilled cash collections, confirm designated agent wallet, and release escrowed on-chain Testnet assets.
        </p>
      </div>

      {statusMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm font-medium">
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm font-medium">
          {errorMessage}
        </div>
      )}

      {/* Manual Release Tool */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h2 className="font-bold text-slate-900 text-base">Release Escrow by Payout ID</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600">Payout UUID</label>
            <input
              type="text"
              value={selectedPayoutId}
              onChange={(e) => setSelectedPayoutId(e.target.value)}
              placeholder="Payout UUID..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Agent Receiving Wallet (G...)</label>
            <input
              type="text"
              value={agentWallet}
              onChange={(e) => setAgentWallet(e.target.value)}
              placeholder="GBAGENT..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => handleReleaseSettlement(selectedPayoutId, agentWallet)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition"
            >
              Approve On-Chain Release
            </button>
          </div>
        </div>
      </div>

      {/* Payouts Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h2 className="font-bold text-slate-900 text-sm">Active Payouts & Settlement Ledger</h2>
          <button
            onClick={fetchPayouts}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            ↻ Refresh List
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="p-3">Payout ID</th>
                <th className="p-3">Asset</th>
                <th className="p-3">Base Units</th>
                <th className="p-3">Chain Status</th>
                <th className="p-3">Settlement</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payouts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400">
                    {loading ? 'Loading payouts...' : 'No payouts found in database.'}
                  </td>
                </tr>
              ) : (
                payouts.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono text-slate-800 font-semibold">{p.id.slice(0, 8)}...</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded font-bold ${
                        p.asset === 'XLM' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {p.asset}
                      </span>
                    </td>
                    <td className="p-3 font-mono">{p.tokenAmountBaseUnits}</td>
                    <td className="p-3">
                      <span className="font-bold uppercase text-slate-700">{p.payoutStatus}</span>
                    </td>
                    <td className="p-3">
                      {p.settlementIntent ? (
                        <span className={`font-semibold ${
                          p.settlementIntent.status === 'CONFIRMED' ? 'text-emerald-600' : 'text-amber-600'
                        }`}>
                          {p.settlementIntent.status}
                        </span>
                      ) : (
                        <span className="text-slate-400">UNINITIATED</span>
                      )}
                    </td>
                    <td className="p-3">
                      {p.payoutStatus === 'FUNDED' ? (
                        <button
                          onClick={() => {
                            setSelectedPayoutId(p.id);
                            setAgentWallet(p.selectedAgentAddress || 'GBAGENTCEBU00000000000000000000000000000000000000000000');
                          }}
                          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium py-1 px-2.5 rounded border border-indigo-200 transition"
                        >
                          Select for Release
                        </button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
