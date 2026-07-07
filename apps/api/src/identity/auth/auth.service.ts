import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import type {
  UserModel as User,
  WorkspaceModel as Workspace,
} from '../../generated/prisma/models';
import { AuthEvents } from '../../common/events';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AuthResponseDto,
  LoginChallengeDto,
  MeResponseDto,
  SignupResponseDto,
} from './dto/auth-response.dto';
import {
  ResendVerificationDto,
  VerifyEmailDto,
  VerifyLoginDto,
} from './dto/email-verification.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { SignupDto } from './dto/signup.dto';

const SALT_ROUNDS = 12;
const OTP_TTL_MS = 15 * 60 * 1000;
const VERIFICATION_SENT_MESSAGE =
  'We sent a 6-digit verification code to your email.';
const LOGIN_CODE_SENT_MESSAGE = 'We sent a 6-digit sign-in code to your email.';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly events: EventEmitter2,
  ) {}

  hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS);
  }

  verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  generateOtp(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  /**
   * Creates the user plus their default workspace, then emails a 6-digit code
   * to confirm the address. No token is issued until the email is verified via
   * verifyEmail(). Re-signing up with an unverified email refreshes the pending
   * credentials and resends the code (so an abandoned signup can be resumed).
   */
  async signup(dto: SignupDto): Promise<SignupResponseDto> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      if (existing.emailVerifiedAt) {
        throw new ConflictException('Email already registered');
      }
      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          name: dto.name,
          passwordHash: await this.hashPassword(dto.password),
        },
      });
      await this.issueEmailVerification(existing);
      return { email: existing.email, message: VERIFICATION_SENT_MESSAGE };
    }

    const passwordHash = await this.hashPassword(dto.password);
    const workspaceName = dto.workspaceName ?? `${dto.name}'s workspace`;

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        workspaces: {
          create: {
            name: workspaceName,
            slug: this.slugify(workspaceName),
          },
        },
      },
    });

    this.events.emit(AuthEvents.USER_SIGNED_UP, {
      id: user.id,
      email: user.email,
    });
    await this.issueEmailVerification(user);
    return { email: user.email, message: VERIFICATION_SENT_MESSAGE };
  }

  /** Confirms the emailed code, marks the address verified, and logs the user in. */
  async verifyEmail(dto: VerifyEmailDto): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { workspaces: { orderBy: { createdAt: 'asc' }, take: 1 } },
    });
    if (!user) throw new UnauthorizedException('Invalid verification code');
    // Idempotent: a second submit (e.g. double-tap on mobile) just logs in.
    if (user.emailVerifiedAt)
      return this.toAuthResponse(user, user.workspaces[0]);
    if (!user.otpSecret || !(await this.verifyOtp(user.otpSecret, dto.otp))) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    const verified = await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date(), otpSecret: null },
    });
    return this.toAuthResponse(verified, user.workspaces[0]);
  }

  /** Re-issues a verification code. Generic 200 so it cannot enumerate accounts. */
  async resendVerification(
    dto: ResendVerificationDto,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (user && !user.emailVerifiedAt) {
      await this.issueEmailVerification(user);
    }
    return { message: VERIFICATION_SENT_MESSAGE };
  }

  /**
   * Password check, step one of two. On success a fresh sign-in code is emailed
   * and the caller must exchange it via verifyLogin() — no token is issued here.
   * Unverified accounts are diverted to email confirmation (403).
   */
  async login(dto: LoginDto): Promise<LoginChallengeDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (
      !user ||
      !(await this.verifyPassword(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.emailVerifiedAt) {
      // Credentials are valid but the address is unconfirmed
      await this.issueOtp(user, AuthEvents.EMAIL_VERIFICATION_REQUESTED);
      throw new ForbiddenException('Please verify your email to continue.');
    }
    await this.issueOtp(user, AuthEvents.LOGIN_OTP_REQUESTED);
    return { email: user.email, message: LOGIN_CODE_SENT_MESSAGE };
  }

  /** Confirms the emailed sign-in code and issues the JWT (step two of login). */
  async verifyLogin(dto: VerifyLoginDto): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { workspaces: { orderBy: { createdAt: 'asc' }, take: 1 } },
    });
    if (
      !user ||
      !user.emailVerifiedAt ||
      !user.otpSecret ||
      !(await this.verifyOtp(user.otpSecret, dto.otp))
    ) {
      throw new UnauthorizedException('Invalid or expired sign-in code');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { otpSecret: null },
    });
    return this.toAuthResponse(user, user.workspaces[0]);
  }

  private issueEmailVerification(user: {
    id: string;
    email: string;
    name: string;
  }): Promise<void> {
    return this.issueOtp(user, AuthEvents.EMAIL_VERIFICATION_REQUESTED);
  }

  /**
   * Generates an OTP, stores its bcrypt hash + expiry on the user, and emits the
   * given mail event. Shared by email verification, login codes and (soon) any
   * other transactional OTP so the storage format stays in one place.
   */
  private async issueOtp(
    user: { id: string; email: string; name: string },
    event: string,
  ): Promise<void> {
    const otp = this.generateOtp();
    const otpHash = await bcrypt.hash(otp, SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { otpSecret: `${otpHash}:${Date.now() + OTP_TTL_MS}` },
    });
    this.events.emit(event, { email: user.email, name: user.name, otp });
  }

  /** Validates a plaintext OTP against a stored `hash:expiresMs` secret. */
  private async verifyOtp(otpSecret: string, otp: string): Promise<boolean> {
    const separator = otpSecret.lastIndexOf(':');
    const otpHash = otpSecret.slice(0, separator);
    const expiresAt = Number(otpSecret.slice(separator + 1));
    return Date.now() < expiresAt && bcrypt.compare(otp, otpHash);
  }

  async me(userId: string): Promise<MeResponseDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { workspaces: { orderBy: { createdAt: 'asc' } } },
    });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      workspaces: user.workspaces,
    };
  }

  /** Always responds 200 so the endpoint cannot be used to enumerate accounts. */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (user) {
      await this.issueOtp(user, AuthEvents.PASSWORD_RESET_REQUESTED);
    }
    return { message: 'If the email exists, a reset code has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user?.otpSecret || !(await this.verifyOtp(user.otpSecret, dto.otp))) {
      throw new UnauthorizedException('Invalid reset code');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await this.hashPassword(dto.newPassword),
        otpSecret: null,
      },
    });
    return { message: 'Password updated' };
  }

  private toAuthResponse(user: User, workspace?: Workspace): AuthResponseDto {
    return {
      accessToken: this.jwtService.sign({
        sub: user.id,
        email: user.email,
        name: user.name,
      }),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      },
      defaultWorkspace: workspace,
    };
  }

  private slugify(value: string): string {
    const base = value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    return `${base || 'workspace'}-${randomUUID().slice(0, 8)}`;
  }
}
