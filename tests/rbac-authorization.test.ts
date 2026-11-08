import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { requireRole, DEMO_SESSIONS } from '../lib/auth';

describe('Server-Side RBAC Enforcement', () => {
  it('allows access when role matches required role', () => {
    const req = new NextRequest('http://localhost:3000/api/settlements/123/release', {
      headers: { 'x-demo-role': 'operator' },
    });

    const result = requireRole(req, ['operator']);
    expect('session' in result).toBe(true);
    if ('session' in result) {
      expect(result.session.role).toBe('operator');
      expect(result.session.userId).toBe(DEMO_SESSIONS.operator.userId);
    }
  });

  it('rejects with 403 Forbidden when unauthorized role attempts endpoint', async () => {
    const req = new NextRequest('http://localhost:3000/api/settlements/123/release', {
      headers: { 'x-demo-role': 'recipient' },
    });

    const result = requireRole(req, ['operator']);
    expect('errorResponse' in result).toBe(true);
    if ('errorResponse' in result) {
      expect(result.errorResponse.status).toBe(403);
      const data = await result.errorResponse.json();
      expect(data.error).toContain("Forbidden: Role 'recipient' is not authorized");
    }
  });

  it('rejects with 401 Unauthorized when no credentials or role header provided', async () => {
    const req = new NextRequest('http://localhost:3000/api/settlements/123/release');

    const result = requireRole(req, ['operator']);
    expect('errorResponse' in result).toBe(true);
    if ('errorResponse' in result) {
      expect(result.errorResponse.status).toBe(401);
      const data = await result.errorResponse.json();
      expect(data.error).toContain('Unauthorized: Missing or invalid authentication session');
    }
  });
});
