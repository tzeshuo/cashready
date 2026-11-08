import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function resetDemo() {
  console.log('====================================================');
  console.log('       CashReady — Showcase Demo Reset Utility      ');
  console.log('====================================================\n');

  console.log('Purging test transactions and reservations...');
  await prisma.auditEvent.deleteMany({});
  await prisma.settlementIntent.deleteMany({});
  await prisma.reservation.deleteMany({});
  await prisma.payout.deleteMany({});
  await prisma.cashInventory.deleteMany({});
  await prisma.agent.deleteMany({});

  console.log('Seeding deterministic showcase agents:');

  // Agent A: Manila QuickCash (Low Cash - used to demonstrate 409 Insufficient Cash error)
  const agentA = await prisma.agent.create({
    data: {
      id: 'agt_manila_quick_001',
      name: 'Manila QuickCash (Agent A - Low Cash)',
      town: 'Manila',
      active: true,
      receivingAddress: 'GDYK2HHHTYIVZP3NF3EJ2PZJFIMFMA7E7TKMDDUFKWLI6ETD3375LQPW',
      operatingHours: '08:00 - 17:00 PHT',
      inventory: {
        create: {
          onHandMinor: 500000,   // ₱5,000.00
          heldMinor: 0,
          bufferMinor: 300000,   // ₱3,000.00 (Available: ₱2,000.00 -> Cannot take ₱10,000)
        },
      },
    },
  });
  console.log(`✓ [Agent A] ${agentA.name} — Avail: ₱2,000.00 (Tests 409 rejection)`);

  // Agent B: Cebu Central Express (Happy Path - Well capitalized)
  const agentB = await prisma.agent.create({
    data: {
      id: 'agt_cebu_central_002',
      name: 'Cebu Central Express (Agent B - Happy Path)',
      town: 'Cebu',
      active: true,
      receivingAddress: 'GBD5EKQLZYO3FFW4OVXTZ5MNEUGDGAZF3SBHD36AHFUAEPQ33TLCGBRK',
      operatingHours: '09:00 - 19:00 PHT',
      inventory: {
        create: {
          onHandMinor: 5000000,  // ₱50,000.00
          heldMinor: 0,
          bufferMinor: 500000,   // ₱5,000.00 (Available: ₱45,000.00)
        },
      },
    },
  });
  console.log(`✓ [Agent B] ${agentB.name} — Avail: ₱45,000.00 (Happy path)`);

  // Agent C: Davao Bay Remit (Offline - Tests offline agent rejection)
  const agentC = await prisma.agent.create({
    data: {
      id: 'agt_davao_bay_003',
      name: 'Davao Bay Remit (Agent C - Offline)',
      town: 'Davao',
      active: false,
      receivingAddress: 'GAVKGUTZESFZ343XUIVGJFA435P6O3HGAGOIRO6HLWR6RGRIJM54YGED',
      operatingHours: 'Closed Today',
      inventory: {
        create: {
          onHandMinor: 2000000,  // ₱20,000.00
          heldMinor: 0,
          bufferMinor: 200000,
        },
      },
    },
  });
  console.log(`✓ [Agent C] ${agentC.name} — Offline (Tests offline rejection)\n`);

  console.log('====================================================');
  console.log('   ✓ Showcase Demo Environment Successfully Reset!  ');
  console.log('====================================================\n');
}

if (require.main === module) {
  resetDemo()
    .catch((e) => {
      console.error('Demo reset error:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
