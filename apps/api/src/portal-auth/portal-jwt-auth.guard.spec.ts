import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { PortalJwtAuthGuard } from './portal-jwt-auth.guard';

const payload = {
  sub: 'user-1',
  email: 'elena@example.com',
  clientPortalId: 'portal-1',
  kind: 'portal_user',
};

function contextWith(authorization?: string) {
  const request: { headers: Record<string, string>; portalUser?: unknown } = {
    headers: authorization ? { authorization } : {},
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('PortalJwtAuthGuard', () => {
  let guard: PortalJwtAuthGuard;
  let jwt: { verify: jest.Mock };
  let prisma: { clientPortalUser: { findUnique: jest.Mock } };

  beforeEach(() => {
    jwt = { verify: jest.fn().mockReturnValue(payload) };
    prisma = {
      clientPortalUser: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: 'active', clientPortalId: 'portal-1' }),
      },
    };
    guard = new PortalJwtAuthGuard(jwt as any, prisma as any);
  });

  it('lets an active user through and attaches the payload', async () => {
    const { context, request } = contextWith('Bearer good');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.portalUser).toEqual(payload);
  });

  it('rejects a request without a bearer token', async () => {
    const { context } = contextWith();

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.clientPortalUser.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an invalid or expired token', async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });
    const { context } = contextWith('Bearer stale');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a workspace-owner token (no portal kind)', async () => {
    jwt.verify.mockReturnValue({ sub: 'owner-1', email: 'o@example.com' });
    const { context } = contextWith('Bearer owner');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.clientPortalUser.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['revoked (deleted)', null],
    ['suspended', { status: 'suspended', clientPortalId: 'portal-1' }],
    ['still only invited', { status: 'invited', clientPortalId: 'portal-1' }],
    ['moved to another portal', { status: 'active', clientPortalId: 'other' }],
  ])(
    'rejects a still-valid token once the user is %s',
    async (_label, user) => {
      prisma.clientPortalUser.findUnique.mockResolvedValue(user);
      const { context, request } = contextWith('Bearer good');

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(request.portalUser).toBeUndefined();
    },
  );
});
