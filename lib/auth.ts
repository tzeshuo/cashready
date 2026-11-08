import { NextRequest } from 'next/server';

export type UserRole = 'funder' | 'recipient' | 'agent' | 'operator';

export interface DemoSession {
  userId: string;
  role: UserRole;
  name: string;
  agentId?: string; // Set when role === 'agent'
  stellarAddress?: string;
}

// Deterministic mock sessions for the demo showcase
export const DEMO_SESSIONS: Record<string, DemoSession> = {
  funder: {
    userId: 'usr_funder_demo',
    role: 'funder',
    name: 'Maria (Demo Funder)',
    stellarAddress: process.env.DEMO_FUNDER_PUBLIC_KEY || 'GBDEMOFUNDERTESTNETKEY00000000000000000000000000000000000',
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
    stellarAddress: 'GBAGENTCEBU00000000000000000000000000000000000000000000',
  },
  'agent-manila': {
    userId: 'usr_agent_manila',
    role: 'agent',
    name: 'Manila QuickCash (Agent A - Low Cash)',
    agentId: 'agt_manila_quick_001',
    stellarAddress: 'GBAGENTMANILA000000000000000000000000000000000000000000',
  },
  'agent-davao': {
    userId: 'usr_agent_davao',
    role: 'agent',
    name: 'Davao Bay Remit (Agent C - Offline)',
    agentId: 'agt_davao_bay_003',
    stellarAddress: 'GBAGENTDAVAO0000000000000000000000000000000000000000000',
  },
  operator: {
    userId: 'usr_operator_demo',
    role: 'operator',
    name: 'CashReady Settlement Operator',
    stellarAddress: process.env.OPERATOR_PUBLIC_KEY || 'GBDEMOOPERATORTESTNETKEY0000000000000000000000000000000000',
  },
};

/**
 * Server-side RBAC session resolver.
 * Reads 'x-demo-role' or 'Authorization' header to determine authenticated identity.
 * In a production setting, this inspects a cryptographically signed JWT or secure session cookie.
 */
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

  // Fallback to cookie if present
  const roleCookie = request.cookies.get('cashready_role')?.value;
  if (roleCookie && DEMO_SESSIONS[roleCookie]) {
    return DEMO_SESSIONS[roleCookie];
  }

  return null;
}

/**
 * Guard utility for Route Handlers to enforce required roles.
 */
export function requireRole(request: NextRequest, allowedRoles: UserRole[]): { session: DemoSession } | { errorResponse: Response } {
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
