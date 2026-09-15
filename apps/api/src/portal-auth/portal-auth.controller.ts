import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentPortalUser } from './decorators/current-portal-user.decorator';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { ForgotPortalPasswordDto } from './dto/forgot-portal-password.dto';
import { PortalLoginDto } from './dto/portal-login.dto';
import { ResetPortalPasswordDto } from './dto/reset-portal-password.dto';
import {
  PortalAuthResponseEntity,
  PortalMessageResponseEntity,
} from './entities/portal-auth-response.entity';
import { PortalMeEntity } from './entities/portal-me.entity';
import { PortalAuthService } from './portal-auth.service';
import { PortalJwtAuthGuard, PortalJwtPayload } from './portal-jwt-auth.guard';

@ApiTags('portal-auth')
@Controller('portal-auth')
export class PortalAuthController {
  constructor(private readonly portalAuthService: PortalAuthService) {}

  @Post('accept-invite')
  @ApiOperation({ summary: 'Accept a client-portal invite, set a password, and sign in' })
  @ApiOkResponse({ type: PortalAuthResponseEntity })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired invite' })
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.portalAuthService.acceptInvite(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Sign in to a client portal' })
  @ApiOkResponse({ type: PortalAuthResponseEntity })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  login(@Body() dto: PortalLoginDto) {
    return this.portalAuthService.login(dto);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a client-portal password reset link' })
  @ApiOkResponse({ type: PortalMessageResponseEntity })
  forgotPassword(@Body() dto: ForgotPortalPasswordDto) {
    return this.portalAuthService.forgotPassword(dto);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset a client-portal password from an emailed link' })
  @ApiOkResponse({ type: PortalMessageResponseEntity })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired reset link' })
  resetPassword(@Body() dto: ResetPortalPasswordDto) {
    return this.portalAuthService.resetPassword(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(PortalJwtAuthGuard)
  @ApiOperation({ summary: 'The signed-in portal user and their portal permissions' })
  @ApiOkResponse({ type: PortalMeEntity })
  me(@CurrentPortalUser() portalUser: PortalJwtPayload) {
    return this.portalAuthService.me(portalUser.sub);
  }
}
