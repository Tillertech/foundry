import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { CreatePortalUserDto } from './dto/create-portal-user.dto';
import { UpdatePortalUserDto } from './dto/update-portal-user.dto';
import { ListPortalUsersQueryDto } from './dto/list-portal-users-query.dto';
import {
  PaginationRes,
  PaginationService,
} from '../common/pagination/pagination.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { ClientPortalUserModel as ClientPortalUser } from '../generated/prisma/models';
import { ClientPortalUserStatus } from '../generated/prisma/enums';
import { PortalEvents } from '../common/events';

const SALT_ROUNDS = 12;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SAFE_OMIT = { passwordHash: true, otpSecret: true } as const;

export type SafePortalUser = Omit<ClientPortalUser, 'passwordHash' | 'otpSecret'>;

@Injectable()
export class PortalUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Invites a user into a client's portal. No password is set here - an
   * invite token is emailed (via PortalEvents.USER_INVITED) and the user
   * picks their own password from the link, mirroring the OTP flow used for
   * workspace users.
   *
   * @param ownerId userId
   */
  async create(ownerId: string, dto: CreatePortalUserDto): Promise<SafePortalUser> {
    const portal = await this.prisma.clientPortal.findFirst({
      where: { id: dto.clientPortalId, client: { workspace: { ownerId } } },
      select: {
        id: true,
        slug: true,
        client: { select: { workspace: { select: { name: true } } } },
      },
    });
    if (!portal) throw new NotFoundException('Client portal not found');

    const existing = await this.prisma.clientPortalUser.findUnique({
      where: { email_clientPortalId: { email: dto.email, clientPortalId: portal.id } },
    });
    if (existing) {
      throw new ConflictException('This email is already invited to this portal');
    }

    const token = this.generateInviteToken();
    const tokenHash = await bcrypt.hash(token, SALT_ROUNDS);
    // passwordHash is NOT NULL but no password exists until the invite is
    // accepted
    const placeholderHash = await bcrypt.hash(randomBytes(32).toString('hex'), SALT_ROUNDS);

    const user = await this.prisma.clientPortalUser.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash: placeholderHash,
        otpSecret: `${tokenHash}:${Date.now() + INVITE_TTL_MS}`,
        status: ClientPortalUserStatus.invited,
        clientPortalId: portal.id,
      },
      omit: SAFE_OMIT,
    });

    this.events.emit(PortalEvents.USER_INVITED, {
      email: user.email,
      name: user.name,
      portalSlug: portal.slug,
      workspaceName: portal.client.workspace.name,
      token,
    });

    return user;
  }

  findAll(
    ownerId: string,
    query: ListPortalUsersQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<SafePortalUser>> {
    const { cursor, take, clientPortalId, status } = query;
    return this.pagination.paginate<SafePortalUser>(
      this.prisma.clientPortalUser,
      {
        where: {
          clientPortal: { client: { workspace: { ownerId } } },
          ...(clientPortalId ? { clientPortalId } : {}),
          ...(status ? { status } : {}),
        },
        omit: SAFE_OMIT,
      },
      {
        cursor,
        take,
        orderBy: { createdAt: 'desc' },
        baseUrl,
        includeCount: true,
      },
    );
  }

  async findOne(ownerId: string, id: string): Promise<SafePortalUser> {
    const user = await this.prisma.clientPortalUser.findFirst({
      where: { id, clientPortal: { client: { workspace: { ownerId } } } },
      omit: SAFE_OMIT,
    });
    if (!user) throw new NotFoundException('Portal user not found');
    return user;
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdatePortalUserDto,
  ): Promise<SafePortalUser> {
    await this.findOne(ownerId, id);
    try {
      return await this.prisma.clientPortalUser.update({
        where: { id },
        data: dto,
        omit: SAFE_OMIT,
      });
    } catch (err) {
      if (this.isDuplicateEmail(err)) {
        throw new ConflictException('This email is already used in this portal');
      }
      throw err;
    }
  }

  async remove(ownerId: string, id: string): Promise<SafePortalUser> {
    await this.findOne(ownerId, id);
    return this.prisma.clientPortalUser.delete({ where: { id }, omit: SAFE_OMIT });
  }

  private generateInviteToken(): string {
    return randomBytes(32).toString('hex');
  }

  private isDuplicateEmail(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
    );
  }
}
