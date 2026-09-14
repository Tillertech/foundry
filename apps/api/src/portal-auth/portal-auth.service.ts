import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PortalEvents } from '../common/events';
import { ClientPortalUserStatus } from '../generated/prisma/enums';
import type { ClientPortalUserModel as ClientPortalUser } from '../generated/prisma/models';

type PortalUserWithSlug = ClientPortalUser & {
  clientPortal: { slug: string };
};
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { PortalLoginDto } from './dto/portal-login.dto';
import { ForgotPortalPasswordDto } from './dto/forgot-portal-password.dto';
import { ResetPortalPasswordDto } from './dto/reset-portal-password.dto';
import { PortalAuthResponseEntity } from './entities/portal-auth-response.entity';
import { PortalMeEntity } from './entities/portal-me.entity';

const SALT_ROUNDS = 12;
const RESET_TTL_MS = 60 * 60 * 1000;
const GENERIC_MESSAGE = {
  message: 'If that email has portal access, a reset link has been sent.',
};

@Injectable()
export class PortalAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly events: EventEmitter2,
  ) {}

  /** First login: accepts an invite, sets the password, and signs the user in. */
  async acceptInvite(dto: AcceptInviteDto): Promise<PortalAuthResponseEntity> {
    const found = await this.findByEmail(dto.email);
    if (
      !found ||
      found.status !== ClientPortalUserStatus.invited ||
      !(await this.verifyToken(found.otpSecret, dto.token))
    ) {
      throw new UnauthorizedException('Invalid or expired invite');
    }
    const updated = await this.setCredentials(found.id, dto.password);
    return this.toAuthResponse(updated, found.clientPortal.slug);
  }

  async login(dto: PortalLoginDto): Promise<PortalAuthResponseEntity> {
    const user = await this.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    // Status is checked before the password: an invited user's passwordHash
    // is an unguessable random placeholder (no password has been set yet),
    // so bcrypt.compare would always fail and mislabel this "wrong password"
    // instead of "accept your invite first".
    if (user.status === ClientPortalUserStatus.invited) {
      throw new ForbiddenException('Accept your invite before signing in');
    }
    if (user.status === ClientPortalUserStatus.suspended) {
      throw new ForbiddenException(
        'Your portal access has been suspended - contact your consulting team.',
      );
    }
    if (!(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.toAuthResponse(user, user.clientPortal.slug);
  }

  /** Always generic so this cannot be used to enumerate portal accounts. */
  async forgotPassword(
    dto: ForgotPortalPasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.findByEmail(dto.email);
    if (user) {
      const token = this.generateToken();
      const tokenHash = await bcrypt.hash(token, SALT_ROUNDS);
      await this.prisma.clientPortalUser.update({
        where: { id: user.id },
        data: { otpSecret: `${tokenHash}:${Date.now() + RESET_TTL_MS}` },
      });
      this.events.emit(PortalEvents.PASSWORD_RESET_REQUESTED, {
        email: user.email,
        name: user.name,
        portalSlug: user.clientPortal.slug,
        token,
      });
    }
    return GENERIC_MESSAGE;
  }

  /** Does not auto-login - matches the main app's reset-password convention. */
  async resetPassword(
    dto: ResetPortalPasswordDto,
  ): Promise<{ message: string }> {
    const found = await this.findByEmail(dto.email);
    if (!found || !(await this.verifyToken(found.otpSecret, dto.token))) {
      throw new UnauthorizedException('Invalid or expired reset link');
    }
    await this.setCredentials(found.id, dto.password);
    return { message: 'Password updated' };
  }

  async me(portalUserId: string): Promise<PortalMeEntity> {
    const user = await this.prisma.clientPortalUser.findUnique({
      where: { id: portalUserId },
      include: {
        clientPortal: {
          include: {
            permission: true,
            client: { select: { id: true, name: true, company: true } },
          },
        },
      },
    });
    if (!user || !user.clientPortal || !user.clientPortal.permission) {
      throw new NotFoundException('Portal user not found');
    }
    const { clientPortal } = user;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      clientPortal: {
        id: clientPortal.id,
        slug: clientPortal.slug,
        active: clientPortal.active,
        permission: {
          viewProjects: clientPortal.permission.viewProjects,
          viewDocuments: clientPortal.permission.viewDocuments,
          viewQuotes: clientPortal.permission.viewQuotes,
          viewPayments: clientPortal.permission.viewPayments,
        },
        client: clientPortal.client,
      },
    };
  }

  private findByEmail(email: string): Promise<PortalUserWithSlug | null> {
    return this.prisma.clientPortalUser.findFirst({
      where: { email },
      include: { clientPortal: { select: { slug: true } } },
    });
  }

  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  /** Validates a plaintext token against a stored `hash:expiresMs` secret. */
  private async verifyToken(
    secret: string | null,
    token: string,
  ): Promise<boolean> {
    if (!secret) return false;
    const separator = secret.lastIndexOf(':');
    const hash = secret.slice(0, separator);
    const expiresAt = Number(secret.slice(separator + 1));
    return Date.now() < expiresAt && bcrypt.compare(token, hash);
  }

  /**
   * Shared by acceptInvite and resetPassword: bcrypt the new password,
   * clear the spent token, and ensure the account is active.
   */
  private async setCredentials(
    userId: string,
    password: string,
  ): Promise<ClientPortalUser> {
    return this.prisma.clientPortalUser.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(password, SALT_ROUNDS),
        otpSecret: null,
        status: ClientPortalUserStatus.active,
        emailVerifiedAt: new Date(),
      },
    });
  }

  private toAuthResponse(
    user: ClientPortalUser,
    portalSlug: string,
  ): PortalAuthResponseEntity {
    return {
      accessToken: this.jwtService.sign({
        sub: user.id,
        email: user.email,
        clientPortalId: user.clientPortalId,
        kind: 'portal_user',
      }),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        clientPortalId: user.clientPortalId,
        portalSlug,
      },
    };
  }
}
