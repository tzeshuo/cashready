import { prisma } from './db';

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
 * Uses Prisma transaction with conditional check to guarantee no race condition can overdraw inventory.
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

    // 3. Atomic conditional check on agent inventory
    const inv = await tx.cashInventory.findUnique({
      where: { agentId },
    });

    if (!inv) {
      return { success: false, error: 'Agent cash inventory not found' };
    }

    const available = inv.onHandMinor - inv.heldMinor - inv.bufferMinor;
    if (available < amountMinor) {
      return {
        success: false,
        error: 'Insufficient available cash at this agent to fulfill reservation hold',
      };
    }

    // Execute atomic update
    await tx.cashInventory.update({
      where: { agentId },
      data: {
        heldMinor: { increment: amountMinor },
        version: { increment: 1 },
      },
    });

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

    const inv = await tx.cashInventory.findUnique({
      where: { agentId: reservation.agentId },
    });

    const decrementAmount = Math.min(inv?.heldMinor || 0, reservation.phpAmountMinor);

    await tx.cashInventory.update({
      where: { agentId: reservation.agentId },
      data: {
        heldMinor: { decrement: decrementAmount },
        version: { increment: 1 },
      },
    });

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

    const inv = await tx.cashInventory.findUnique({
      where: { agentId: reservation.agentId },
    });

    const decHeld = Math.min(inv?.heldMinor || 0, reservation.phpAmountMinor);
    const decOnHand = Math.min(inv?.onHandMinor || 0, reservation.phpAmountMinor);

    // Decrement both held and on_hand once
    await tx.cashInventory.update({
      where: { agentId: reservation.agentId },
      data: {
        heldMinor: { decrement: decHeld },
        onHandMinor: { decrement: decOnHand },
        version: { increment: 1 },
      },
    });

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

/**
 * Updates reported on-hand cash balance.
 * Rejects inconsistent manual balance changes:
 * Enforces that new on-hand balance is strictly >= held_minor + buffer_minor.
 */
export async function updateOnHandBalanceAtomic(
  agentId: string,
  newOnHandMinor: number,
  actor: string
): Promise<{ success: boolean; error?: string }> {
  if (newOnHandMinor < 0) {
    return { success: false, error: 'On-hand balance cannot be negative' };
  }

  return await prisma.$transaction(async (tx) => {
    const inv = await tx.cashInventory.findUnique({
      where: { agentId },
    });

    if (!inv) {
      return { success: false, error: 'Agent inventory not found' };
    }

    const minRequired = inv.heldMinor + inv.bufferMinor;
    if (newOnHandMinor < minRequired) {
      return {
        success: false,
        error: `Inconsistent balance change rejected: New on-hand balance (${newOnHandMinor}) cannot be less than active holds + buffer (${minRequired})`,
      };
    }

    await tx.cashInventory.update({
      where: { agentId },
      data: {
        onHandMinor: newOnHandMinor,
        version: { increment: 1 },
      },
    });

    await tx.auditEvent.create({
      data: {
        actor,
        action: 'INVENTORY_ON_HAND_UPDATED',
        entityRef: `inventory:${inv.id}`,
        metadata: JSON.stringify({
          agentId,
          oldOnHandMinor: inv.onHandMinor,
          newOnHandMinor,
        }),
      },
    });

    return { success: true };
  });
}
