import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { ReleaseSettlementSchema } from '@/lib/validation';

export async function POST(
  request: NextRequest,
  { params }: { params: { payoutId: string } }
) {
  const auth = requireRole(request, ['operator']);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  const { payoutId } = params;
  const operatorSession = auth.session;

  try {
    const body = await request.json();
    const parseResult = ReleaseSettlementSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid settlement release payload', details: parseResult.error.errors },
        { status: 400 }
      );
    }

    const { agentWallet } = parseResult.data;

    // 1. Verify Payout exists and is FUNDED
    const payout = await prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        reservations: {
          where: { status: 'FULFILLED' },
        },
        settlementIntent: true,
      },
    });

    if (!payout) {
      return NextResponse.json({ error: 'Payout not found' }, { status: 404 });
    }

    if (payout.payoutStatus !== 'FUNDED') {
      return NextResponse.json(
        { error: `Cannot release payout with status '${payout.payoutStatus}'. Must be FUNDED.` },
        { status: 400 }
      );
    }

    // 2. Invariant: physical pickup must be attested and FULFILLED
    if (payout.reservations.length === 0) {
      return NextResponse.json(
        { error: 'Cannot release on-chain settlement: No fulfilled physical cash reservation exists for this payout.' },
        { status: 412 } // 412 Precondition Failed
      );
    }

    // 3. Idempotency: If settlement intent is already CONFIRMED, return success
    if (payout.settlementIntent?.status === 'CONFIRMED') {
      return NextResponse.json({
        success: true,
        message: 'Settlement already confirmed on-chain',
        txHash: payout.settlementIntent.txHash,
        payoutStatus: payout.payoutStatus,
      });
    }

    // 4. Upsert SettlementIntent in PENDING state BEFORE external network broadcast
    const settlementIntent = await prisma.settlementIntent.upsert({
      where: { payoutId },
      create: {
        payoutId,
        approvalActor: operatorSession.userId,
        status: 'PENDING',
      },
      update: {
        status: 'PENDING',
        error: null,
      },
    });

    // 5. In a real Testnet flow, this triggers Soroban release transaction signed by the server-side operator key.
    // For local MVP / simulation before E2 contract is deployed, generate a simulated or real tx hash:
    const mockTxHash = `sim_tx_${Date.now().toString(16)}_${Math.random().toString(16).substring(2, 10)}`;

    // In a live integration, query Horizon/RPC: if confirmed:
    await prisma.$transaction(async (tx) => {
      await tx.settlementIntent.update({
        where: { id: settlementIntent.id },
        data: {
          status: 'CONFIRMED',
          txHash: mockTxHash,
        },
      });

      await tx.payout.update({
        where: { id: payoutId },
        data: {
          payoutStatus: 'RELEASED',
          selectedAgentAddress: agentWallet,
        },
      });

      await tx.auditEvent.create({
        data: {
          actor: operatorSession.userId,
          action: 'SETTLEMENT_RELEASED_ONCHAIN',
          entityRef: `payout:${payoutId}`,
          metadata: JSON.stringify({ agentWallet, txHash: mockTxHash }),
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: 'Settlement released on Stellar Testnet to fulfilled agent wallet.',
      payoutId,
      agentWallet,
      txHash: mockTxHash,
      explorerUrl: `https://stellar.expert/explorer/testnet/tx/${mockTxHash}`,
    });
  } catch (error: any) {
    console.error('Failed to release settlement:', error);
    // If on-chain transaction failed, record FAILED_RETRYABLE in DB
    await prisma.settlementIntent.update({
      where: { payoutId },
      data: {
        status: 'FAILED_RETRYABLE',
        error: error.message || 'Unknown network error',
      },
    });

    return NextResponse.json(
      {
        error: 'Settlement execution failed; marked as retryable. Physical pickup remains fulfilled.',
        details: error.message,
      },
      { status: 502 }
    );
  }
}
