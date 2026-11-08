import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { ConfirmFundingSchema } from '@/lib/validation';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireRole(request, ['funder', 'operator']);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  const payoutId = params.id;

  try {
    const body = await request.json();
    const parseResult = ConfirmFundingSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid confirmation payload', details: parseResult.error.errors },
        { status: 400 }
      );
    }

    const { fundingTxHash, onchainPayoutId } = parseResult.data;

    const payout = await prisma.payout.findUnique({
      where: { id: payoutId },
    });

    if (!payout) {
      return NextResponse.json({ error: 'Payout not found' }, { status: 404 });
    }

    if (payout.payoutStatus !== 'CREATED') {
      return NextResponse.json(
        { error: `Cannot confirm funding for payout in status: ${payout.payoutStatus}` },
        { status: 400 }
      );
    }

    // Update status to FUNDED
    const updated = await prisma.payout.update({
      where: { id: payoutId },
      data: {
        payoutStatus: 'FUNDED',
        fundingTxHash,
        onchainPayoutId: onchainPayoutId || payoutId,
      },
    });

    await prisma.auditEvent.create({
      data: {
        actor: auth.session.userId,
        action: 'PAYOUT_FUNDED_CONFIRMED',
        entityRef: `payout:${payoutId}`,
        metadata: JSON.stringify({ fundingTxHash, onchainPayoutId }),
      },
    });

    return NextResponse.json({
      success: true,
      payoutId: updated.id,
      status: updated.payoutStatus,
      fundingTxHash: updated.fundingTxHash,
      message: 'Payout is confirmed FUNDED. Cash reservation can now be requested by recipient.',
    });
  } catch (error) {
    console.error('Failed to confirm funding:', error);
    return NextResponse.json({ error: 'Internal server error while confirming funding' }, { status: 500 });
  }
}
