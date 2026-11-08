import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { VerifyPickupSchema } from '@/lib/validation';
import { verifyPickupPin } from '@/lib/otp';
import { fulfillCashPickupAtomic, releaseCashHoldAtomic } from '@/lib/inventory';

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
    const body = await request.json();
    const parseResult = VerifyPickupSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid PIN payload', details: parseResult.error.errors },
        { status: 400 }
      );
    }

    const { pin } = parseResult.data;

    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { agent: true, payout: true },
    });

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    // Role check: agent must be the one assigned
    if (agentSession.agentId && agentSession.agentId !== reservation.agentId) {
      return NextResponse.json(
        { error: 'Forbidden: You cannot verify pickup for an agent you do not represent' },
        { status: 403 }
      );
    }

    // Status check
    if (reservation.status !== 'CONFIRMED') {
      return NextResponse.json(
        { error: `Cannot verify pickup for reservation in status '${reservation.status}'` },
        { status: 400 }
      );
    }

    // Expiration check
    if (new Date() > new Date(reservation.expiresAt)) {
      await releaseCashHoldAtomic(reservationId, 'EXPIRED', 'system:expiry_checker');
      return NextResponse.json(
        { error: 'Cash reservation hold has expired. Inventory has been released.' },
        { status: 410 } // 410 Gone
      );
    }

    // Attempt counter check (max 5 attempts)
    if (reservation.pinAttempts >= 5) {
      await releaseCashHoldAtomic(reservationId, 'CANCELLED', 'system:rate_limit_exceeded');
      return NextResponse.json(
        { error: 'Maximum PIN verification attempts exceeded. Reservation cancelled and hold released.' },
        { status: 429 } // 429 Too Many Requests
      );
    }

    // Constant-time HMAC comparison
    const isValidPin = reservation.pickupPinHmac
      ? verifyPickupPin(reservationId, pin, reservation.pickupPinHmac)
      : false;

    if (!isValidPin) {
      const updatedAttempts = reservation.pinAttempts + 1;
      await prisma.reservation.update({
        where: { id: reservationId },
        data: { pinAttempts: updatedAttempts },
      });

      const remaining = 5 - updatedAttempts;
      return NextResponse.json(
        {
          error: `Invalid PIN code. ${remaining} attempt(s) remaining.`,
          attemptsRemaining: remaining,
        },
        { status: 401 }
      );
    }

    // Recipient simulated acknowledgement check
    if (!reservation.acknowledgedAt) {
      return NextResponse.json(
        {
          error: 'Recipient has not yet acknowledged simulated cash collection. Recipient must acknowledge before handover completion.',
          requiresAcknowledgement: true,
        },
        { status: 412 } // 412 Precondition Failed
      );
    }

    // Atomic fulfillment: decrements both held_minor and on_hand_minor once
    const fulfillResult = await fulfillCashPickupAtomic(reservationId, agentSession.userId);
    if (!fulfillResult.success) {
      return NextResponse.json(
        { error: fulfillResult.error || 'Failed to fulfill cash handover' },
        { status: 500 }
      );
    }

    // Record selected agent address on Payout for subsequent operator release
    await prisma.payout.update({
      where: { id: reservation.payoutId },
      data: { selectedAgentAddress: reservation.agent.receivingAddress },
    });

    return NextResponse.json({
      success: true,
      message: 'Cash handover attested and verified. Physical reservation is FULFILLED.',
      reservationStatus: 'FULFILLED',
      nextStep: 'Operator may now approve and execute on-chain settlement release to agent wallet.',
      receivingAgentWallet: reservation.agent.receivingAddress,
    });
  } catch (error) {
    console.error('Failed to verify pickup:', error);
    return NextResponse.json({ error: 'Internal server error while verifying pickup' }, { status: 500 });
  }
}
