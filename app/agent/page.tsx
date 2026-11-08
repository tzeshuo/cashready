'use client';

import { useState, useEffect } from 'react';

interface AgentProfile {
  id: string;
  name: string;
  roleKey: string;
  town: string;
}

const DEMO_AGENTS: AgentProfile[] = [
  {
    id: 'agt_cebu_central_002',
    name: 'Cebu Central Express (Agent B - Happy Path)',
    roleKey: 'agent-cebu',
    town: 'Cebu',
  },
  {
    id: 'agt_manila_quick_001',
    name: 'Manila QuickCash (Agent A - Low Cash)',
    roleKey: 'agent-manila',
    town: 'Manila',
  },
  {
    id: 'agt_davao_bay_003',
    name: 'Davao Bay Remit (Agent C - Offline)',
    roleKey: 'agent-davao',
    town: 'Davao',
  },
];

export default function AgentPage() {
  const [selectedAgent, setSelectedAgent] = useState<AgentProfile>(DEMO_AGENTS[0]);
  const [reservationId, setReservationId] = useState<string>('');
  const [pinInput, setPinInput] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Agent inventory stats & reservations queue
  const [inventory, setInventory] = useState<any>(null);
  const [agentReservations, setAgentReservations] = useState<any[]>([]);

  useEffect(() => {
    fetchAgentDetails();
  }, [selectedAgent]);

  async function fetchAgentDetails() {
    try {
      // 1. Fetch agent inventory
      const res = await fetch(`/api/agents?town=${selectedAgent.town}`, {
        headers: { 'x-demo-role': selectedAgent.roleKey },
      });
      const data = await res.json();
      if (res.ok && data.agents?.length > 0) {
        const found = data.agents.find((a: any) => a.id === selectedAgent.id);
        if (found) setInventory(found);
      }

      // 2. Fetch reservations queue for this agent
      const resvRes = await fetch(`/api/reservations?agentId=${selectedAgent.id}`, {
        headers: { 'x-demo-role': selectedAgent.roleKey },
      });
      const resvData = await resvRes.json();
      if (resvRes.ok) {
        setAgentReservations(resvData.reservations || []);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleConfirmHold(idToConfirm?: string) {
    const targetId = idToConfirm || reservationId;
    if (!targetId) {
      setErrorMessage('Please enter or select a Reservation UUID to confirm.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setStatusMessage('Executing atomic inventory conditional update...');

    try {
      const res = await fetch(`/api/reservations/${targetId}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-role': selectedAgent.roleKey,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to confirm cash hold');
      }

      setStatusMessage(`✓ Hold Confirmed! ${data.message}`);
      setReservationId(targetId);
      await fetchAgentDetails();
    } catch (err: any) {
      setErrorMessage(err.message);
      setStatusMessage('');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyPickup() {
    if (!reservationId || !pinInput) {
      setErrorMessage('Please provide both the Reservation ID and 6-digit PIN.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setStatusMessage('Verifying HMAC and attesting cash handover...');

    try {
      const res = await fetch(`/api/reservations/${reservationId}/verify-pickup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-demo-role': selectedAgent.roleKey,
        },
        body: JSON.stringify({ pin: pinInput }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'PIN verification failed');
      }

      setStatusMessage(`✓ Cash Pickup Handover Verified! Physical status is FULFILLED.`);
      await fetchAgentDetails();
    } catch (err: any) {
      setErrorMessage(err.message);
      setStatusMessage('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agent Desk</h1>
          <p className="text-sm text-slate-600">
            Agent point-of-presence terminal. Confirm time-limited cash holds and attest physical cash handover with 6-digit OTP verification.
          </p>
        </div>
        <button
          onClick={fetchAgentDetails}
          className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-300 font-medium transition"
        >
          ↻ Refresh Desk
        </button>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent Switcher & Inventory */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="font-bold text-slate-900 text-base">Select Agent Terminal</h2>
          
          <div className="space-y-2">
            {DEMO_AGENTS.map((agent) => (
              <div
                key={agent.id}
                onClick={() => setSelectedAgent(agent)}
                className={`p-3 rounded-lg border text-xs cursor-pointer transition ${
                  selectedAgent.id === agent.id
                    ? 'border-emerald-500 bg-emerald-50/50 font-semibold'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>{agent.name}</div>
                <div className="text-slate-500 text-[11px] mt-1">Town: {agent.town}</div>
              </div>
            ))}
          </div>

          {inventory && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="font-bold text-slate-800 border-b border-slate-200 pb-1">
                Real-Time Cash Liquidity (Centavos/PHP)
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">On-Hand Cash:</span>
                <span className="font-mono font-bold">₱{(inventory.onHandMinor / 100).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Held (Active Holds):</span>
                <span className="font-mono text-amber-600 font-bold">₱{(inventory.heldMinor / 100).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Required Buffer:</span>
                <span className="font-mono text-slate-400">₱{(inventory.bufferMinor / 100).toLocaleString()}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200 text-sm font-extrabold text-emerald-700">
                <span>Available for Hold:</span>
                <span className="font-mono">₱{(inventory.availableMinor / 100).toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        {/* Action 1: Confirm Cash Hold */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="font-bold text-slate-900 text-base flex items-center space-x-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 inline-flex items-center justify-center text-xs">1</span>
            <span>Confirm Reservation Hold</span>
          </h2>

          <p className="text-xs text-slate-600">
            Accept a pending reservation. Executes an atomic conditional database update ensuring available cash exceeds requested cash.
          </p>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-slate-600">Reservation UUID</label>
              <span className="text-[10px] text-slate-400 font-mono">(Must be Reservation ID, not Payout ID)</span>
            </div>
            <input
              type="text"
              value={reservationId}
              onChange={(e) => setReservationId(e.target.value)}
              placeholder="Paste Reservation UUID..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
            />
          </div>

          <button
            onClick={() => handleConfirmHold()}
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-lg text-sm transition disabled:opacity-50"
          >
            Confirm & Lock Cash Hold
          </button>

          {/* Incoming Queue for this agent */}
          <div className="pt-3 border-t border-slate-200 space-y-2">
            <div className="text-xs font-bold text-slate-700 flex justify-between items-center">
              <span>Incoming Queue ({selectedAgent.town})</span>
              <span className="text-[11px] text-slate-500 font-normal">{agentReservations.length} total</span>
            </div>

            {agentReservations.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No incoming requests for this agent yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {agentReservations.map((resv) => (
                  <div
                    key={resv.id}
                    className={`p-2 rounded-lg border text-xs flex justify-between items-center ${
                      reservationId === resv.id ? 'border-emerald-500 bg-emerald-50/40' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="font-mono text-[11px] font-bold text-slate-800">{resv.id.slice(0, 8)}...</div>
                      <div className="text-[10px] text-slate-500">
                        ₱{(resv.phpAmountMinor / 100).toLocaleString()} •{' '}
                        <span className={`font-semibold ${
                          resv.status === 'CONFIRMED' ? 'text-emerald-600' :
                          resv.status === 'REQUESTED' ? 'text-amber-600' : 'text-slate-600'
                        }`}>
                          {resv.status}
                        </span>
                      </div>
                    </div>

                    <div className="flex space-x-1">
                      <button
                        onClick={() => {
                          setReservationId(resv.id);
                        }}
                        className="text-[11px] bg-white border border-slate-300 text-slate-700 px-2 py-1 rounded hover:bg-slate-100"
                      >
                        Select
                      </button>
                      {resv.status === 'REQUESTED' && (
                        <button
                          onClick={() => handleConfirmHold(resv.id)}
                          className="text-[11px] bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700 font-medium"
                        >
                          Confirm
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action 2: PIN Verification & Handover Attestation */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="font-bold text-slate-900 text-base flex items-center space-x-2">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 inline-flex items-center justify-center text-xs">2</span>
            <span>Verify Pickup PIN</span>
          </h2>

          <p className="text-xs text-slate-600">
            Recipient presents the 6-digit OTP code at physical pickup. Agent verifies HMAC and attests cash handover.
          </p>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-600">6-Digit OTP Code</label>
            <input
              type="text"
              maxLength={6}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="e.g. 748291"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-lg tracking-widest text-center font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <button
            onClick={handleVerifyPickup}
            disabled={loading}
            className="w-full bg-slate-900 hover:bg-black text-white font-medium py-2 px-4 rounded-lg text-sm transition disabled:opacity-50"
          >
            Verify PIN & Attest Handover
          </button>
        </div>
      </div>
    </div>
  );
}
