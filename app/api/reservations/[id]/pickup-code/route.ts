import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { unsealPinForRecipient } from '@/lib/otp';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireRole(request, ['recipient']);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  const reservationId = params.id;

  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    // Withhold PIN if still in REQUESTED status
    if (reservation.status === 'REQUESTED') {
      return NextResponse.json(
        {
          error: 'Forbidden: Pickup PIN is withheld until the assigned agent explicitly confirms the cash hold.',
          status: reservation.status,
        },
        { status: 403 }
      );
    }

    // Expiry check
    if (reservation.status === 'EXPIRED' || new Date() > new Date(reservation.expiresAt)) {
      return NextResponse.json(
        { error: 'Gone: Cash reservation has expired. Pickup code is invalid.' },
        { status: 410 }
      );
    }

    // Single-use consumption check
    if (reservation.status === 'FULFILLED') {
      return NextResponse.json(
        { error: 'Gone: Pickup code has already been consumed and fulfilled.' },
        { status: 410 }
      );
    }

    if (reservation.status === 'CANCELLED' || reservation.status === 'REJECTED') {
      return NextResponse.json(
        { error: `Cannot retrieve PIN for reservation in status: ${reservation.status}` },
        { status: 410 }
      );
    }

    // Status is CONFIRMED: Unseal PIN for recipient
    if (!reservation.sealedPin) {
      return NextResponse.json(
        { error: 'No sealed PIN available for this reservation' },
        { status: 500 }
      );
    }

    const pin = unsealPinForRecipient(reservation.sealedPin, reservation.id);
    if (!pin) {
      return NextResponse.json(
        { error: 'Failed to unseal PIN authentication token' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      reservationId: reservation.id,
      pin,
      status: reservation.status,
      expiresAt: reservation.expiresAt,
      attemptsRemaining: Math.max(0, 5 - reservation.pinAttempts),
      notice: 'Show this 6-digit code to the agent at cash pickup. Single-use only.',
    });
  } catch (error) {
    console.error('Failed to retrieve pickup PIN:', error);
    return NextResponse.json({ error: 'Internal server error while fetching pickup PIN' }, { status: 500 });
  }
}
