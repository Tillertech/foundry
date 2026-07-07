import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import {
  AuthResponseDto,
  MeResponseDto,
  MessageResponseDto,
} from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { SignupDto } from './dto/signup.dto';
import { JwtAuthGuard, JwtPayload } from './jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @ApiOperation({
    summary: 'Create an account; a default workspace is created alongside it',
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiConflictResponse({ description: 'Email already registered' })
  signup(@Body() dto: SignupDto): Promise<AuthResponseDto> {
    return this.authService.signup(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange credentials for a JWT' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user profile with workspaces' })
  @ApiOkResponse({ type: MeResponseDto })
  me(@CurrentUser() user: JwtPayload): Promise<MeResponseDto> {
    return this.authService.me(user.sub);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email a 6-digit password reset code' })
  @ApiOkResponse({ type: MessageResponseDto })
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<MessageResponseDto> {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset the password using the emailed code' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired reset code' })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<MessageResponseDto> {
    return this.authService.resetPassword(dto);
  }
}
