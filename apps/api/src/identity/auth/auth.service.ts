import {
  ConflictException,
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
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthResponseDto, MeResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { SignupDto } from './dto/signup.dto';

const SALT_ROUNDS = 12;
const OTP_TTL_MS = 15 * 60 * 1000;

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

  /** Creates the user plus their default workspace in one transaction. */
  async signup(dto: SignupDto): Promise<AuthResponseDto> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already registered');

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
      include: { workspaces: true },
    });

    this.events.emit('user.signed_up', { id: user.id, email: user.email });
    return this.toAuthResponse(user, user.workspaces[0]);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { workspaces: { orderBy: { createdAt: 'asc' }, take: 1 } },
    });
    if (!user || !(await this.verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.toAuthResponse(user, user.workspaces[0]);
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
      const otp = this.generateOtp();
      const otpHash = await bcrypt.hash(otp, SALT_ROUNDS);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { otpSecret: `${otpHash}:${Date.now() + OTP_TTL_MS}` },
      });
      this.events.emit('auth.password_reset_requested', {
        email: user.email,
        name: user.name,
        otp,
      });
    }
    return { message: 'If the email exists, a reset code has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user?.otpSecret) throw new UnauthorizedException('Invalid reset code');

    const separator = user.otpSecret.lastIndexOf(':');
    const otpHash = user.otpSecret.slice(0, separator);
    const expiresAt = Number(user.otpSecret.slice(separator + 1));
    const valid =
      Date.now() < expiresAt && (await bcrypt.compare(dto.otp, otpHash));
    if (!valid) throw new UnauthorizedException('Invalid reset code');

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
