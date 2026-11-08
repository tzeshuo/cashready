import { NextRequest } from 'next/server';

export type UserRole = 'funder' | 'recipient' | 'agent' | 'operator';

export interface DemoSession {
  userId: string;
  role: UserRole;
  name: string;
  agentId?: string; // Set when role === 'agent'
  stellarAddress?: string;
}

// Deterministic mock sessions with valid 56-char Stellar Testnet addresses
export const DEMO_SESSIONS: Record<string, DemoSession> = {
  funder: {
    userId: 'usr_funder_demo',
    role: 'funder',
    name: 'Maria (Demo Funder)',
    stellarAddress: process.env.DEMO_FUNDER_PUBLIC_KEY || 'GACR4M343MW6OV6Z4T6FHPK47MFJZNUU6Z3ENNICPF3L665VHZ2VIOZN',
  },
  recipient: {
    userId: 'usr_recipient_demo',
    role: 'recipient',
    name: 'Juan (Demo Recipient)',
  },
  'agent-cebu': {
    userId: 'usr_agent_cebu',
    role: 'agent',
    name: 'Cebu Central Express (Agent B)',
    agentId: 'agt_cebu_central_002',
    stellarAddress: 'GBD5EKQLZYO3FFW4OVXTZ5MNEUGDGAZF3SBHD36AHFUAEPQ33TLCGBRK',
  },
  'agent-manila': {
    userId: 'usr_agent_manila',
    role: 'agent',
    name: 'Manila QuickCash (Agent A - Low Cash)',
    agentId: 'agt_manila_quick_001',
    stellarAddress: 'GDYK2HHHTYIVZP3NF3EJ2PZJFIMFMA7E7TKMDDUFKWLI6ETD3375LQPW',
  },
  'agent-davao': {
    userId: 'usr_agent_davao',
    role: 'agent',
    name: 'Davao Bay Remit (Agent C - Offline)',
    agentId: 'agt_davao_bay_003',
    stellarAddress: 'GAVKGUTZESFZ343XUIVGJFA435P6O3HGAGOIRO6HLWR6RGRIJM54YGED',
  },
  operator: {
    userId: 'usr_operator_demo',
    role: 'operator',
    name: 'CashReady Settlement Operator',
    stellarAddress: process.env.OPERATOR_PUBLIC_KEY || 'GAMO4WVADWGDUIJZXWUFCQWENBVO5MZXESTSOGPQNFX7GPK4SASKLOHE',
  },
};

export function getSession(request: NextRequest): DemoSession | null {
  const roleHeader = request.headers.get('x-demo-role');
  if (roleHeader && DEMO_SESSIONS[roleHeader]) {
    return DEMO_SESSIONS[roleHeader];
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (DEMO_SESSIONS[token]) {
      return DEMO_SESSIONS[token];
    }
  }

  const roleCookie = request.cookies.get('cashready_role')?.value;
  if (roleCookie && DEMO_SESSIONS[roleCookie]) {
    return DEMO_SESSIONS[roleCookie];
  }

  return null;
}

export function requireRole(
  request: NextRequest,
  allowedRoles: UserRole[]
): { session: DemoSession } | { errorResponse: Response } {
  const session = getSession(request);

  if (!session) {
    return {
      errorResponse: new Response(
        JSON.stringify({ error: 'Unauthorized: Missing or invalid authentication session' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }

  if (!allowedRoles.includes(session.role)) {
    return {
      errorResponse: new Response(
        JSON.stringify({
          error: `Forbidden: Role '${session.role}' is not authorized to perform this action. Required: [${allowedRoles.join(', ')}]`,
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }

  return { session };
}
