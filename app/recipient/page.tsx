'use client';

import { useState, useEffect } from 'react';

interface Agent {
  id: string;
  name: string;
  town: string;
  operatingHours: string;
  receivingAddress: string;
  active: boolean;
  availableMinor: number;
}

export default function RecipientPage() {
  const [town, setTown] = useState<string>('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  
  // Payout info
  const [payoutId, setPayoutId] = useState<string>('');
  const [payoutStatus, setPayoutStatus] = useState<any>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [requestAmountPhp, setRequestAmountPhp] = useState<number>(10000);
  
  // Active reservation & OTP
  const [reservation, setReservation] = useState<any>(null);
  const [otpCode, setOtpCode] = useState<string>(''); // Simulated for demo recipient display
  const [acknowledged, setAcknowledged] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    fetchAgents();
  }, [town]);

  async function fetchAgents() {
    setLoadingAgents(true);
    try {
      const url = town ? `/api/agents?town=${town}` : '/api/agents';
      const res = await fetch(url, {
        headers: { 'x-demo-role': 'recipient' },
      });
      const data = await res.json();
      if (res.ok) {
        setAgents(data.agents || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAgents(false);
    }
  }

  // Helper to create a quick test funded payout for demo convenience
  async function handleCreateDemoPayout(asset: 'XLM' | 'USDC') {
    setErrorMessage('');
    setStatusMessage(`Creating and funding demo ${asset} payout...`);
    try {
      const res = await fetch('/api/payouts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-role': 'funder',
        },
        body: JSON.stringify({
          funderAddress: 'GACR4M343MW6OV6Z4T6FHPK47MFJZNUU6Z3ENNICPF3L665VHZ2VIOZN',
          asset,
          tokenAmountBaseUnits: asset === 'XLM' ? '100000000' : '20000000', // 10 XLM or 2 USDC
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create payout intent');

      // Auto-confirm funding for demo
      const confirmRes = await fetch(`/api/payouts/${data.payoutId}/confirm-funding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-role': 'funder',
        },
        body: JSON.stringify({
          fundingTxHash: `tx_${Date.now()}_testnet_hash`,
        }),
      });

      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmData.error || 'Failed to confirm funding');

      setPayoutId(data.payoutId);
      setStatusMessage(`Payout created and confirmed FUNDED: ${data.payoutId}`);
      await refreshPayoutStatus(data.payoutId);
    } catch (err: any) {
      setErrorMessage(err.message);
      setStatusMessage('');
    }
  }

  async function refreshPayoutStatus(id: string) {
    if (!id) return;
    try {
      const res = await fetch(`/api/payouts/${id}/status`, {
        headers: { 'x-demo-role': 'recipient' },
      });
      const data = await res.json();
      if (res.ok) {
        setPayoutStatus(data);
        if (data.cashReservation) {
          setReservation(data.cashReservation);
          setAcknowledged(!!data.cashReservation.acknowledgedAt);
          // If confirmed, fetch unsealed 6-digit PIN for recipient display
          if (data.cashReservation.status === 'CONFIRMED') {
            fetch(`/api/reservations/${data.cashReservation.id}/pickup-code`, {
              headers: { 'x-demo-role': 'recipient' },
            })
              .then((r) => r.json())
              .then((pinData) => {
                if (pinData.pin) setOtpCode(pinData.pin);
              })
              .catch(console.error);
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleRequestReservation() {
    setErrorMessage('');
    setStatusMessage('Submitting cash reservation request...');

    if (!payoutId) {
      setErrorMessage('Please enter or create a funded Payout ID first.');
      return;
    }
    if (!selectedAgentId) {
      setErrorMessage('Please choose a cash-out agent.');
      return;
    }

    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-role': 'recipient',
        },
        body: JSON.stringify({
          payoutId,
          agentId: selectedAgentId,
          phpAmountMinor: requestAmountPhp * 100, // convert to centavos
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reservation request failed');

      setStatusMessage('Reservation request created! Please have the agent confirm cash hold.');
      await refreshPayoutStatus(payoutId);
    } catch (err: any) {
      setErrorMessage(err.message);
      setStatusMessage('');
    }
  }

  async function handleAcknowledgeReceipt() {
    if (!reservation?.id) return;
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-role': 'recipient',
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Acknowledgement failed');
      setAcknowledged(true);
      setStatusMessage('Simulated cash receipt acknowledged! Agent can now attest handover.');
      await refreshPayoutStatus(payoutId);
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">Recipient Portal</h1>
        <p className="text-sm text-slate-600">
          Find a local participating agent, request a time-limited cash reservation, and obtain your one-time pickup code.
        </p>
      </div>

      {statusMessage && (
        <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-sm">
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Step 1: Payout Setup */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="font-bold text-slate-900 text-base flex items-center space-x-2">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 inline-flex items-center justify-center text-xs">1</span>
            <span>Remittance Payout</span>
          </h2>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-600">Active Payout ID (UUID)</label>
            <input
              type="text"
              value={payoutId}
              onChange={(e) => {
                setPayoutId(e.target.value);
                refreshPayoutStatus(e.target.value);
              }}
              placeholder="Paste existing Payout UUID..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-2">
            <p className="text-xs text-slate-500">Or generate a fresh funded Testnet payout:</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleCreateDemoPayout('XLM')}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium py-2 px-3 rounded-lg border border-slate-300 transition"
              >
                + Fund 10 XLM
              </button>
              <button
                onClick={() => handleCreateDemoPayout('USDC')}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium py-2 px-3 rounded-lg border border-slate-300 transition"
              >
                + Fund 2 USDC
              </button>
            </div>
          </div>

          {payoutStatus && (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Blockchain Status:</span>
                <span className="font-bold text-blue-600">{payoutStatus.blockchain?.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Asset:</span>
                <span>{payoutStatus.blockchain?.asset}</span>
              </div>
              {payoutStatus.cashReservation && (
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="text-slate-500">Cash Status:</span>
                  <span className="font-bold text-amber-600">{payoutStatus.cashReservation?.status}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 2: Agent Selection */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="font-bold text-slate-900 text-base flex items-center space-x-2">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 inline-flex items-center justify-center text-xs">2</span>
            <span>Choose Agent & Amount</span>
          </h2>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-600">Filter Town</label>
            <select
              value={town}
              onChange={(e) => setTown(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Towns</option>
              <option value="Cebu">Cebu (Agent B - Well Capitalized)</option>
              <option value="Manila">Manila (Agent A - Low Cash)</option>
              <option value="Davao">Davao (Agent C - Offline)</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-600">Requested Cash (PHP)</label>
            <input
              type="number"
              value={requestAmountPhp}
              onChange={(e) => setRequestAmountPhp(Number(e.target.value))}
              step="500"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto pt-2">
            <label className="text-xs font-semibold text-slate-600">Select Participating Agent</label>
            {loadingAgents ? (
              <p className="text-xs text-slate-500">Loading agents...</p>
            ) : (
              agents.map((ag) => (
                <div
                  key={ag.id}
                  onClick={() => setSelectedAgentId(ag.id)}
                  className={`p-3 rounded-lg border text-xs cursor-pointer transition ${
                    selectedAgentId === ag.id
                      ? 'border-blue-500 bg-blue-50/50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="font-bold text-slate-800">{ag.name}</div>
                  <div className="text-slate-500 flex justify-between mt-1">
                    <span>Town: {ag.town}</span>
                    <span className="font-mono text-emerald-600 font-semibold">
                      Avail: ₱{(ag.availableMinor / 100).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <button
            onClick={handleRequestReservation}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition"
          >
            Request Cash Hold
          </button>
        </div>

        {/* Step 3: Confirmation & Pickup Code */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="font-bold text-slate-900 text-base flex items-center space-x-2">
            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 inline-flex items-center justify-center text-xs">3</span>
            <span>Pickup & Attestation</span>
          </h2>

          {reservation ? (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="text-xs text-slate-500">Reservation Status:</div>
                <div className="text-lg font-bold text-slate-900 uppercase tracking-wide">
                  {reservation.status}
                </div>

                {reservation.status === 'CONFIRMED' && (
                  <div className="pt-2 border-t border-slate-200 text-center space-y-2">
                    <p className="text-xs text-slate-600">
                      Show this 6-digit one-time pickup code to the agent:
                    </p>
                    <div className="font-mono text-3xl font-extrabold tracking-widest text-emerald-600 bg-white py-2 px-4 rounded-lg border border-emerald-200 shadow-inner">
                      {otpCode || '......'}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Valid for 15 minutes • Single-use only
                    </p>
                  </div>
                )}

                {reservation.status === 'REQUESTED' && (
                  <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                    Awaiting Agent to confirm inventory hold from the Agent Desk.
                  </div>
                )}

                {reservation.status === 'FULFILLED' && (
                  <div className="text-xs text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-200 font-medium">
                    ✓ Cash pickup completed! Awaiting operator settlement release.
                  </div>
                )}
              </div>

              {reservation.status === 'CONFIRMED' && !acknowledged && (
                <button
                  onClick={handleAcknowledgeReceipt}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition"
                >
                  Acknowledge Simulated Cash Collection
                </button>
              )}

              {acknowledged && (
                <div className="text-center text-xs text-emerald-600 font-semibold">
                  ✓ Recipient has acknowledged simulated cash collection
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400 text-xs">
              No active reservation. Create or link a payout to begin.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
