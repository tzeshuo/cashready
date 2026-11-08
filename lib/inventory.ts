import { prisma } from './db';
import { Prisma } from '@prisma/client';

export interface InventoryCalculation {
  onHandMinor: number;
  heldMinor: number;
  bufferMinor: number;
  availableMinor: number;
}

export function computeAvailable(onHandMinor: number, heldMinor: number, bufferMinor: number): number {
  return onHandMinor - heldMinor - bufferMinor;
}

/**
 * Atomically confirms a cash hold for a reservation.
 * Uses a raw conditional update inside a transaction to guarantee no race conditions can overdraw inventory.
 * 
 * Rules:
 * - Only increments held_minor if (on_hand_minor - held_minor - buffer_minor >= requested_amount)
 * - Inserts AuditEvent in the SAME transaction
 * - Ensures at most one CONFIRMED hold per payout
 */
export async function holdCashAtomic(
  reservationId: string,
  agentId: string,
  payoutId: string,
  amountMinor: number,
  actor: string
): Promise<{ success: boolean; error?: string }> {
  return await prisma.$transaction(async (tx) => {
    // 1. Check if the payout already has an active CONFIRMED reservation
    const activeExisting = await tx.reservation.findFirst({
      where: {
        payoutId,
        status: 'CONFIRMED',
        id: { not: reservationId },
      },
    });

    if (activeExisting) {
      return { success: false, error: 'Payout already has an active confirmed cash reservation' };
    }

    // 2. Fetch current reservation
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      return { success: false, error: 'Reservation not found' };
    }

    if (reservation.status !== 'REQUESTED') {
      return { success: false, error: `Cannot confirm reservation in status: ${reservation.status}` };
    }

    // 3. Atomic conditional update on inventory
    // Execute conditional UPDATE ensuring available liquidity is strictly sufficient
    const updatedRows = await tx.$executeRaw`
      UPDATE "CashInventory"
      SET "heldMinor" = "heldMinor" + ${amountMinor},
          "version" = "version" + 1,
          "updatedAt" = NOW()
      WHERE "agentId" = ${agentId}
        AND ("onHandMinor" - "heldMinor" - "bufferMinor") >= ${amountMinor}
    `;

    if (updatedRows === 0) {
      return {
        success: false,
        error: 'Insufficient available cash at this agent to fulfill reservation hold',
      };
    }

    // 4. Update reservation status to CONFIRMED with 15-minute expiry
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await tx.reservation.update({
      where: { id: reservationId },
      data: {
        status: 'CONFIRMED',
        expiresAt,
      },
    });

    // 5. Record audit event in the same transaction
    await tx.auditEvent.create({
      data: {
        actor,
        action: 'RESERVATION_HOLD_CONFIRMED',
        entityRef: `reservation:${reservationId}`,
        metadata: JSON.stringify({ agentId, payoutId, amountMinor, expiresAt }),
      },
    });

    return { success: true };
  });
}

/**
 * Atomically releases a held cash reservation upon expiry or cancellation.
 * Decrements held_minor once; never mutates on_hand_minor.
 */
export async function releaseCashHoldAtomic(
  reservationId: string,
  reason: 'EXPIRED' | 'CANCELLED',
  actor: string
): Promise<{ success: boolean; error?: string }> {
  return await prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      return { success: false, error: 'Reservation not found' };
    }

    if (reservation.status !== 'CONFIRMED') {
      return { success: false, error: `Cannot release hold for status: ${reservation.status}` };
    }

    // Decrement heldMinor once, ensuring it doesn't fall below zero
    await tx.$executeRaw`
      UPDATE "CashInventory"
      SET "heldMinor" = GREATEST(0, "heldMinor" - ${reservation.phpAmountMinor}),
          "version" = "version" + 1,
          "updatedAt" = NOW()
      WHERE "agentId" = ${reservation.agentId}
    `;

    await tx.reservation.update({
      where: { id: reservationId },
      data: { status: reason },
    });

    await tx.auditEvent.create({
      data: {
        actor,
        action: `RESERVATION_HOLD_${reason}`,
        entityRef: `reservation:${reservationId}`,
        metadata: JSON.stringify({ amountMinor: reservation.phpAmountMinor, agentId: reservation.agentId }),
      },
    });

    return { success: true };
  });
}

/**
 * Atomically fulfills cash pickup.
 * Decrements BOTH held_minor and on_hand_minor once.
 */
export async function fulfillCashPickupAtomic(
  reservationId: string,
  actor: string
): Promise<{ success: boolean; error?: string }> {
  return await prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
      include: { payout: true },
    });

    if (!reservation) {
      return { success: false, error: 'Reservation not found' };
    }

    if (reservation.status !== 'CONFIRMED') {
      return { success: false, error: `Cannot fulfill reservation in status: ${reservation.status}` };
    }

    // Decrement both held and on_hand once
    await tx.$executeRaw`
      UPDATE "CashInventory"
      SET "heldMinor" = GREATEST(0, "heldMinor" - ${reservation.phpAmountMinor}),
          "onHandMinor" = GREATEST(0, "onHandMinor" - ${reservation.phpAmountMinor}),
          "version" = "version" + 1,
          "updatedAt" = NOW()
      WHERE "agentId" = ${reservation.agentId}
    `;

    const now = new Date();
    await tx.reservation.update({
      where: { id: reservationId },
      data: {
        status: 'FULFILLED',
        pickupAt: now,
      },
    });

    await tx.auditEvent.create({
      data: {
        actor,
        action: 'RESERVATION_FULFILLED',
        entityRef: `reservation:${reservationId}`,
        metadata: JSON.stringify({
          amountMinor: reservation.phpAmountMinor,
          agentId: reservation.agentId,
          fulfilledAt: now,
        }),
      },
    });

    return { success: true };
  });
}
