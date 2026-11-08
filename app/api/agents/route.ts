import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { computeAvailable } from '@/lib/inventory';

export async function GET(request: NextRequest) {
  // Allow recipient, funder, or operator to view agents
  const auth = requireRole(request, ['recipient', 'funder', 'operator']);
  if ('errorResponse' in auth) {
    return auth.errorResponse;
  }

  const searchParams = request.nextUrl.searchParams;
  const town = searchParams.get('town');

  try {
    const whereClause: { active?: boolean; town?: string } = { active: true };
    if (town) {
      whereClause.town = town;
    }

    const agents = await prisma.agent.findMany({
      where: whereClause,
      include: {
        inventory: true,
      },
      orderBy: { name: 'asc' },
    });

    const agentList = agents.map((agent) => {
      const inv = agent.inventory;
      const onHand = inv?.onHandMinor || 0;
      const held = inv?.heldMinor || 0;
      const buffer = inv?.bufferMinor || 0;
      const available = computeAvailable(onHand, held, buffer);

      return {
        id: agent.id,
        name: agent.name,
        town: agent.town,
        operatingHours: agent.operatingHours,
        receivingAddress: agent.receivingAddress,
        active: agent.active,
        availableMinor: Math.max(0, available),
        onHandMinor: onHand,
        heldMinor: held,
        bufferMinor: buffer,
        disclaimer: 'Fictional demo agent. Cash availability is simulated.',
      };
    });

    return NextResponse.json({ agents: agentList });
  } catch (error) {
    console.error('Failed to list agents:', error);
    return NextResponse.json({ error: 'Internal server error while retrieving agents' }, { status: 500 });
  }
}
