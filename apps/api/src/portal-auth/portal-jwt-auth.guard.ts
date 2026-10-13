import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ClientPortalUserStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

export interface PortalJwtPayload {
  /** ClientPortalUser id */
  sub: string;
  email: string;
  clientPortalId: string;
  kind: 'portal_user';
}

@Injectable()
export class PortalJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { portalUser?: PortalJwtPayload }>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let payload: PortalJwtPayload;
    try {
      payload = this.jwtService.verify<PortalJwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (payload.kind !== 'portal_user') {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // The token outlives the decisions a workspace owner makes about the
    // user: revoking (deleting) or suspending them has to cut access now,
    // not when the JWT expires.
    const user = await this.prisma.clientPortalUser.findUnique({
      where: { id: payload.sub },
      select: { status: true, clientPortalId: true },
    });
    if (
      !user ||
      user.clientPortalId !== payload.clientPortalId ||
      user.status !== ClientPortalUserStatus.active
    ) {
      throw new UnauthorizedException('Your portal access is no longer active');
    }

    request.portalUser = payload;
    return true;
  }
}
