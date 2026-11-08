import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { CreateReservationSchema } from '@/lib/validation';
import { generatePickupPin, hashPickupPin, sealPinForRecipient } from '@/lib/otp';

export async function POST(request: NextRequest) {
  const auth = requireRole(request, ['recipient']);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  try {
    const body = await request.json();
    const parseResult = CreateReservationSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid reservation payload', details: parseResult.error.errors },
        { status: 400 }
      );
    }

    const { payoutId, agentId, phpAmountMinor } = parseResult.data;

    // 1. Verify that the payout exists and is confirmed FUNDED
    const payout = await prisma.payout.findUnique({
      where: { id: payoutId },
    });

    if (!payout) {
      return NextResponse.json({ error: 'Payout not found' }, { status: 404 });
    }

    if (payout.payoutStatus !== 'FUNDED') {
      return NextResponse.json(
        {
          error: `Cannot reserve cash for payout with status '${payout.payoutStatus}'. Payout must be confirmed FUNDED on Testnet first.`,
        },
        { status: 400 }
      );
    }

    // 2. Verify agent exists and is active
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: { inventory: true },
    });

    if (!agent || !agent.active) {
      return NextResponse.json(
        { error: 'Selected agent is either not found or currently inactive/offline' },
        { status: 400 }
      );
    }

    // 3. Ensure no active confirmed reservation exists for this payout
    const existingActive = await prisma.reservation.findFirst({
      where: {
        payoutId,
        status: { in: ['CONFIRMED', 'REQUESTED'] },
      },
    });

    if (existingActive) {
      return NextResponse.json(
        {
          error: 'An active reservation already exists for this payout. Cancel or let it expire before creating a new one.',
          existingReservationId: existingActive.id,
        },
        { status: 409 }
      );
    }

    // 4. Generate Reservation and CSPRNG OTP PIN
    const generatedPin = generatePickupPin();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min default window

    const reservation = await prisma.$transaction(async (tx) => {
      const res = await tx.reservation.create({
        data: {
          payoutId,
          agentId,
          phpAmountMinor,
          status: 'REQUESTED',
          expiresAt,
          pickupPinHmac: '', // populated upon hold confirmation
        },
      });

      // Compute HMAC bound to this newly created reservation ID and seal PIN
      const pinHmac = hashPickupPin(res.id, generatedPin);
      const sealedPin = sealPinForRecipient(generatedPin, res.id);
      
      const updated = await tx.reservation.update({
        where: { id: res.id },
        data: {
          pickupPinHmac: pinHmac,
          sealedPin,
        },
      });

      await tx.auditEvent.create({
        data: {
          actor: auth.session.userId,
          action: 'RESERVATION_REQUESTED',
          entityRef: `reservation:${res.id}`,
          metadata: JSON.stringify({ payoutId, agentId, phpAmountMinor }),
        },
      });

      return updated;
    });

    return NextResponse.json(
      {
        reservationId: reservation.id,
        status: reservation.status,
        agentId: reservation.agentId,
        phpAmountMinor: reservation.phpAmountMinor,
        expiresAt: reservation.expiresAt,
        message: 'Reservation requested. Awaiting agent inventory confirmation.',
        // Note: PIN is strictly withheld until agent confirms hold
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create reservation:', error);
    return NextResponse.json({ error: 'Internal server error while creating reservation' }, { status: 500 });
  }
}
