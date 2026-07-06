import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { JwtPayload } from '../jwt-auth.guard';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtPayload =>
    context.switchToHttp().getRequest().user,
);
