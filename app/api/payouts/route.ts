import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { CreatePayoutSchema } from '@/lib/validation';
import { getAssetConfig } from '@/lib/assets';

export async function POST(request: NextRequest) {
  const auth = requireRole(request, ['funder']);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  try {
    const body = await request.json();
    const parseResult = CreatePayoutSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid payout payload', details: parseResult.error.errors },
        { status: 400 }
      );
    }

    const { funderAddress, asset, tokenAmountBaseUnits } = parseResult.data;
    const assetConfig = getAssetConfig(asset);

    // Create unfunded payout record in DB
    const payout = await prisma.payout.create({
      data: {
        funderAddress,
        asset,
        assetIssuer: assetConfig.issuer || null,
        assetSacId: assetConfig.sacContractId,
        tokenAmountBaseUnits,
        payoutStatus: 'CREATED',
      },
    });

    await prisma.auditEvent.create({
      data: {
        actor: auth.session.userId,
        action: 'PAYOUT_INTENT_CREATED',
        entityRef: `payout:${payout.id}`,
        metadata: JSON.stringify({ asset, tokenAmountBaseUnits, funderAddress }),
      },
    });

    return NextResponse.json(
      {
        payoutId: payout.id,
        status: payout.payoutStatus,
        asset: payout.asset,
        assetSacId: payout.assetSacId,
        tokenAmountBaseUnits: payout.tokenAmountBaseUnits,
        instructions: {
          message: 'Payout intent created. Submit Soroban create_and_fund transaction on Stellar Testnet.',
          targetContractId: process.env.PAYOUT_CONTRACT_ID || 'UNCONFIGURED_CONTRACT_ID',
          assetSac: payout.assetSacId,
          amountBaseUnits: payout.tokenAmountBaseUnits,
          note: 'Beneficiary agent is NOT hard-coded at funding time. Agent is designated upon fulfillment.',
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create payout:', error);
    return NextResponse.json({ error: 'Internal server error while creating payout intent' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, ['funder', 'operator']);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  try {
    const payouts = await prisma.payout.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        reservations: true,
        settlementIntent: true,
      },
    });

    return NextResponse.json({ payouts });
  } catch (error) {
    console.error('Failed to query payouts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
