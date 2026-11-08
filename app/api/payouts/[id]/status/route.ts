import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireRole(request, ['funder', 'recipient', 'agent', 'operator']);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  const payoutId = params.id;

  try {
    const payout = await prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        reservations: {
          include: { agent: true },
          orderBy: { createdAt: 'desc' },
        },
        settlementIntent: true,
      },
    });

    if (!payout) {
      return NextResponse.json({ error: 'Payout not found' }, { status: 404 });
    }

    const latestReservation = payout.reservations[0] || null;

    const response = {
      payoutId: payout.id,
      blockchain: {
        status: payout.payoutStatus, // CREATED, FUNDED, RELEASED, REFUNDED
        asset: payout.asset,
        tokenAmountBaseUnits: payout.tokenAmountBaseUnits,
        fundingTxHash: payout.fundingTxHash,
        fundingExplorerUrl: payout.fundingTxHash
          ? `https://stellar.expert/explorer/testnet/tx/${payout.fundingTxHash}`
          : null,
        settlementIntent: payout.settlementIntent
          ? {
              status: payout.settlementIntent.status,
              txHash: payout.settlementIntent.txHash,
              releaseExplorerUrl: payout.settlementIntent.txHash
                ? `https://stellar.expert/explorer/testnet/tx/${payout.settlementIntent.txHash}`
                : null,
              error: payout.settlementIntent.error,
            }
          : null,
      },
      cashReservation: latestReservation
        ? {
            id: latestReservation.id,
            status: latestReservation.status, // REQUESTED, CONFIRMED, FULFILLED, etc.
            agentName: latestReservation.agent.name,
            agentTown: latestReservation.agent.town,
            phpAmountMinor: latestReservation.phpAmountMinor,
            expiresAt: latestReservation.expiresAt,
            pickupAt: latestReservation.pickupAt,
            acknowledgedAt: latestReservation.acknowledgedAt,
          }
        : null,
      immutabilityNote:
        'Payment custody status on Stellar Testnet and cash reservation status in DB are strictly decoupled.',
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Failed to get status:', error);
    return NextResponse.json({ error: 'Internal server error while fetching status' }, { status: 500 });
  }
}
