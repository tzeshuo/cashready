import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';

export async function POST(
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

    if (reservation.status !== 'CONFIRMED') {
      return NextResponse.json(
        { error: `Cannot acknowledge reservation in status '${reservation.status}'` },
        { status: 400 }
      );
    }

    const updated = await prisma.reservation.update({
      where: { id: reservationId },
      data: { acknowledgedAt: new Date() },
    });

    await prisma.auditEvent.create({
      data: {
        actor: auth.session.userId,
        action: 'RECIPIENT_ACKNOWLEDGED_PICKUP',
        entityRef: `reservation:${reservationId}`,
        metadata: JSON.stringify({ acknowledgedAt: updated.acknowledgedAt }),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Simulated cash receipt acknowledged by recipient.',
      reservationId: updated.id,
      acknowledgedAt: updated.acknowledgedAt,
    });
  } catch (error) {
    console.error('Failed to acknowledge pickup:', error);
    return NextResponse.json({ error: 'Internal server error while acknowledging pickup' }, { status: 500 });
  }
}
