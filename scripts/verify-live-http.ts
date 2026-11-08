async function verifyLiveServer() {
  console.log('Testing live HTTP server at http://localhost:3000...\n');

  // 1. Health check / Agents list
  const agentsRes = await fetch('http://localhost:3000/api/agents', {
    headers: { 'x-demo-role': 'recipient' },
  });
  const agentsData = await agentsRes.json();
  console.log(`1. GET /api/agents => status ${agentsRes.status}`);
  if (!agentsRes.ok || !agentsData.agents) {
    throw new Error(`Failed to fetch agents: ${JSON.stringify(agentsData)}`);
  }
  console.log(`   Found ${agentsData.agents.length} active agents.\n`);

  // 2. Create Payout
  const payoutRes = await fetch('http://localhost:3000/api/payouts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-demo-role': 'funder',
    },
    body: JSON.stringify({
      funderAddress: 'GACR4M343MW6OV6Z4T6FHPK47MFJZNUU6Z3ENNICPF3L665VHZ2VIOZN',
      asset: 'XLM',
      tokenAmountBaseUnits: '100000000',
    }),
  });
  const payoutData = await payoutRes.json();
  console.log(`2. POST /api/payouts => status ${payoutRes.status}`);
  if (!payoutRes.ok || !payoutData.payoutId) {
    throw new Error(`Failed to create payout: ${JSON.stringify(payoutData)}`);
  }
  console.log(`   Created Payout ID: ${payoutData.payoutId}\n`);

  // 3. Confirm Funding
  const confirmFundingRes = await fetch(
    `http://localhost:3000/api/payouts/${payoutData.payoutId}/confirm-funding`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-role': 'funder',
      },
      body: JSON.stringify({
        fundingTxHash: `tx_live_test_${Date.now()}`,
      }),
    }
  );
  const confirmFundingData = await confirmFundingRes.json();
  console.log(`3. POST /confirm-funding => status ${confirmFundingRes.status}`);
  if (!confirmFundingRes.ok) {
    throw new Error(`Confirm funding failed: ${JSON.stringify(confirmFundingData)}`);
  }
  console.log(`   Payout is now: ${confirmFundingData.status}\n`);

  // 4. Request Reservation at Agent B (Cebu)
  const agentB = agentsData.agents.find((a: any) => a.town === 'Cebu');
  const resvRes = await fetch('http://localhost:3000/api/reservations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-demo-role': 'recipient',
    },
    body: JSON.stringify({
      payoutId: payoutData.payoutId,
      agentId: agentB.id,
      phpAmountMinor: 1000000, // ₱10,000
    }),
  });
  const resvData = await resvRes.json();
  console.log(`4. POST /api/reservations => status ${resvRes.status}`);
  if (!resvRes.ok || !resvData.reservationId) {
    throw new Error(`Create reservation failed: ${JSON.stringify(resvData)}`);
  }
  console.log(`   Reservation ID: ${resvData.reservationId}\n`);

  // 5. Agent B confirms hold
  const agentConfirmRes = await fetch(
    `http://localhost:3000/api/reservations/${resvData.reservationId}/confirm`,
    {
      method: 'POST',
      headers: {
        'x-demo-role': 'agent-cebu',
      },
    }
  );
  const agentConfirmData = await agentConfirmRes.json();
  console.log(`5. POST /reservations/:id/confirm => status ${agentConfirmRes.status}`);
  if (!agentConfirmRes.ok) {
    throw new Error(`Agent hold confirmation failed: ${JSON.stringify(agentConfirmData)}`);
  }
  console.log(`   Hold Confirmed! Status: ${agentConfirmData.status}\n`);

  // 6. Recipient fetches unsealed OTP PIN
  const pinRes = await fetch(
    `http://localhost:3000/api/reservations/${resvData.reservationId}/pickup-code`,
    {
      headers: {
        'x-demo-role': 'recipient',
      },
    }
  );
  const pinData = await pinRes.json();
  console.log(`6. GET /pickup-code => status ${pinRes.status}`);
  if (!pinRes.ok || !pinData.pin) {
    throw new Error(`Failed to unseal PIN: ${JSON.stringify(pinData)}`);
  }
  console.log(`   Recipient unsealed 6-digit OTP code: ${pinData.pin}\n`);

  // 7. Recipient acknowledges simulated cash collection
  const ackRes = await fetch(
    `http://localhost:3000/api/reservations/${resvData.reservationId}/acknowledge`,
    {
      method: 'POST',
      headers: {
        'x-demo-role': 'recipient',
      },
    }
  );
  console.log(`7. POST /acknowledge => status ${ackRes.status}`);
  if (!ackRes.ok) throw new Error('Recipient acknowledgement failed');

  // 8. Agent verifies PIN and attests handover
  const verifyRes = await fetch(
    `http://localhost:3000/api/reservations/${resvData.reservationId}/verify-pickup`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-role': 'agent-cebu',
      },
      body: JSON.stringify({ pin: pinData.pin }),
    }
  );
  const verifyData = await verifyRes.json();
  console.log(`8. POST /verify-pickup => status ${verifyRes.status}`);
  if (!verifyRes.ok) {
    throw new Error(`PIN verification failed: ${JSON.stringify(verifyData)}`);
  }
  console.log(`   Handover Verified! Status: ${verifyData.reservationStatus}\n`);

  // 9. Operator approves on-chain release
  const releaseRes = await fetch(
    `http://localhost:3000/api/settlements/${payoutData.payoutId}/release`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-demo-role': 'operator',
      },
      body: JSON.stringify({
        agentWallet: verifyData.receivingAgentWallet,
      }),
    }
  );
  const releaseData = await releaseRes.json();
  console.log(`9. POST /settlements/:payoutId/release => status ${releaseRes.status}`);
  if (!releaseRes.ok) {
    throw new Error(`Release failed: ${JSON.stringify(releaseData)}`);
  }
  console.log(`   On-chain Release Confirmed! Tx: ${releaseData.txHash}\n`);

  // 10. Check Dual Status
  const statusRes = await fetch(
    `http://localhost:3000/api/payouts/${payoutData.payoutId}/status`,
    {
      headers: { 'x-demo-role': 'recipient' },
    }
  );
  const statusData = await statusRes.json();
  console.log(`10. GET /payouts/:id/status => status ${statusRes.status}`);
  console.log(`    Blockchain: ${statusData.blockchain?.status}`);
  console.log(`    Cash: ${statusData.cashReservation?.status}`);

  console.log('\n====================================================');
  console.log('  ✓ ALL 10 LIVE HTTP SERVER ENDPOINTS PASSED 100%! ');
  console.log('====================================================\n');
}

verifyLiveServer().catch((err) => {
  console.error('Live server probe failed:', err);
  process.exit(1);
});
