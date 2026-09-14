import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export interface PortalJwtPayload {
  /** ClientPortalUser id */
  sub: string;
  email: string;
  clientPortalId: string;
  kind: 'portal_user';
}

@Injectable()
export class PortalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { portalUser?: PortalJwtPayload }>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Missing bearer token');
    try {
      const payload = this.jwtService.verify<PortalJwtPayload>(token);
      if (payload.kind !== 'portal_user') {
        throw new UnauthorizedException('Invalid token');
      }
      request.portalUser = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
