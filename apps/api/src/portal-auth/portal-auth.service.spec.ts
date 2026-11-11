import type { Mock } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PortalEvents } from '../common/events';
import { PortalAuthService } from './portal-auth.service';

const slug = 'acme';

async function user(over: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    name: 'Elena',
    email: 'elena@example.com',
    passwordHash: await bcrypt.hash('correct-horse', 4),
    otpSecret: null as string | null,
    status: 'active',
    clientPortalId: 'portal-1',
    clientPortal: { slug, active: true },
    ...over,
  };
}

/** A `hash:expiresMs` secret for `token`, as the services store it. */
async function secretFor(token: string, ttlMs = 60_000) {
  return `${await bcrypt.hash(token, 4)}:${Date.now() + ttlMs}`;
}

describe('PortalAuthService', () => {
  let service: PortalAuthService;
  let prisma: { clientPortalUser: { findFirst: Mock; update: Mock } };
  let events: { emit: Mock };

  beforeEach(() => {
    prisma = {
      clientPortalUser: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(async ({ data }) => ({ ...(await user()), ...data })),
      },
    };
    events = { emit: vi.fn() };
    const jwt = { sign: vi.fn().mockReturnValue('jwt') };
    service = new PortalAuthService(prisma as any, jwt as any, events as any);
  });

  it('looks users up within the portal, case-insensitively', async () => {
    prisma.clientPortalUser.findFirst.mockResolvedValue(await user());

    await service.login({
      slug,
      email: ' Elena@Example.com ',
      password: 'correct-horse',
    });

    expect(prisma.clientPortalUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email: { equals: 'Elena@Example.com', mode: 'insensitive' },
          clientPortal: { slug },
        },
      }),
    );
  });

  describe('login', () => {
    it('signs an active user in', async () => {
      prisma.clientPortalUser.findFirst.mockResolvedValue(await user());
      await expect(
        service.login({
          slug,
          email: 'elena@example.com',
          password: 'correct-horse',
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          accessToken: 'jwt',
          user: expect.objectContaining({ portalSlug: slug }),
        }),
      );
    });

    it('refuses a disabled portal once the password checks out', async () => {
      prisma.clientPortalUser.findFirst.mockResolvedValue(
        await user({ clientPortal: { slug, active: false } }),
      );
      await expect(
        service.login({
          slug,
          email: 'elena@example.com',
          password: 'correct-horse',
        }),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.login({ slug, email: 'elena@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('forgotPassword', () => {
    it('emails an active user a link for this portal', async () => {
      prisma.clientPortalUser.findFirst.mockResolvedValue(await user());
      await service.forgotPassword({ slug, email: 'elena@example.com' });
      expect(events.emit).toHaveBeenCalledWith(
        PortalEvents.PASSWORD_RESET_REQUESTED,
        expect.objectContaining({ portalSlug: slug }),
      );
    });

    it.each(['suspended', 'invited'])(
      'sends nothing to a %s user but answers the same',
      async (status) => {
        prisma.clientPortalUser.findFirst.mockResolvedValue(
          await user({ status }),
        );
        await expect(
          service.forgotPassword({ slug, email: 'elena@example.com' }),
        ).resolves.toEqual({ message: expect.any(String) });
        expect(events.emit).not.toHaveBeenCalled();
        expect(prisma.clientPortalUser.update).not.toHaveBeenCalled();
      },
    );
  });

  describe('resetPassword', () => {
    it('sets the password without touching the status', async () => {
      prisma.clientPortalUser.findFirst.mockResolvedValue(
        await user({ otpSecret: await secretFor('tok') }),
      );
      await service.resetPassword({
        slug,
        email: 'elena@example.com',
        token: 'tok',
        password: 'new-password',
      });
      const { data } = prisma.clientPortalUser.update.mock.calls[0][0];
      expect(data).not.toHaveProperty('status');
      expect(data.otpSecret).toBeNull();
    });

    it('never lifts a suspension, even with a valid link', async () => {
      prisma.clientPortalUser.findFirst.mockResolvedValue(
        await user({ status: 'suspended', otpSecret: await secretFor('tok') }),
      );
      await expect(
        service.resetPassword({
          slug,
          email: 'elena@example.com',
          token: 'tok',
          password: 'new-password',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.clientPortalUser.update).not.toHaveBeenCalled();
    });
  });

  describe('acceptInvite', () => {
    it('activates an invited user', async () => {
      prisma.clientPortalUser.findFirst.mockResolvedValue(
        await user({ status: 'invited', otpSecret: await secretFor('tok') }),
      );
      await service.acceptInvite({
        slug,
        email: 'elena@example.com',
        token: 'tok',
        password: 'new-password',
      });
      expect(prisma.clientPortalUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'active',
            emailVerifiedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('rejects an expired invite', async () => {
      prisma.clientPortalUser.findFirst.mockResolvedValue(
        await user({
          status: 'invited',
          otpSecret: await secretFor('tok', -1),
        }),
      );
      await expect(
        service.acceptInvite({
          slug,
          email: 'elena@example.com',
          token: 'tok',
          password: 'new-password',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
