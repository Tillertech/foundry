import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { PortalJwtPayload } from '../portal-jwt-auth.guard';

export const CurrentPortalUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PortalJwtPayload =>
    context.switchToHttp().getRequest().portalUser,
);
