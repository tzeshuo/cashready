import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { holdCashAtomic } from '@/lib/inventory';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireRole(request, ['agent']);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  const reservationId = params.id;
  const agentSession = auth.session;

  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { payout: true },
    });

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    // Role check: agent can only confirm requests assigned to their agentId
    if (agentSession.agentId && agentSession.agentId !== reservation.agentId) {
      return NextResponse.json(
        { error: 'Forbidden: Agent is not authorized to confirm reservations assigned to another agent' },
        { status: 403 }
      );
    }

    // Idempotency: if already confirmed, return success immediately
    if (reservation.status === 'CONFIRMED') {
      return NextResponse.json({
        success: true,
        message: 'Reservation is already confirmed',
        reservationId: reservation.id,
        status: reservation.status,
        expiresAt: reservation.expiresAt,
      });
    }

    // Verify payout is still funded
    if (reservation.payout.payoutStatus !== 'FUNDED') {
      return NextResponse.json(
        { error: `Associated payout is in status '${reservation.payout.payoutStatus}', not FUNDED` },
        { status: 400 }
      );
    }

    // Perform atomic conditional update on Postgres cash inventory
    const holdResult = await holdCashAtomic(
      reservationId,
      reservation.agentId,
      reservation.payoutId,
      reservation.phpAmountMinor,
      agentSession.userId
    );

    if (!holdResult.success) {
      return NextResponse.json(
        { error: holdResult.error || 'Failed to hold cash' },
        { status: 409 } // 409 Conflict / Insufficient inventory
      );
    }

    const updated = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });

    return NextResponse.json({
      success: true,
      message: 'Cash hold accepted and locked. Recipient may now view pickup code.',
      reservationId: updated?.id,
      status: updated?.status,
      expiresAt: updated?.expiresAt,
    });
  } catch (error) {
    console.error('Failed to confirm reservation:', error);
    return NextResponse.json({ error: 'Internal server error while confirming cash hold' }, { status: 500 });
  }
}
