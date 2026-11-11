import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import { WorkspaceScope } from '../common/workspace-scope/workspace-scope';

const SALT_ROUNDS = 12;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SAFE_OMIT = { passwordHash: true, otpSecret: true } as const;
const WITH_PROJECTS = { projects: { select: { projectId: true } } } as const;

export type SafePortalUser = Omit<
  ClientPortalUser,
  'passwordHash' | 'otpSecret'
> & {
  /** Projects the user is limited to; empty while `allProjects` is true. */
  projectIds: string[];
};

type UserRow = Omit<ClientPortalUser, 'passwordHash' | 'otpSecret'> & {
  projects: { projectId: string }[];
};

/** Flattens the join rows into `projectIds` - the shape every response uses. */
export function toSafePortalUser({
  projects,
  ...user
}: UserRow): SafePortalUser {
  return {
    ...user,
    projectIds: user.allProjects ? [] : projects.map((p) => p.projectId),
  };
}

/** Portal sign-in matches emails case-insensitively; store one canonical form. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class PortalUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly events: EventEmitter2,
    private readonly workspaceScope: WorkspaceScope,
  ) {}

  /**
   * Invites a user into a client's portal. No password is set here - an
   * invite token is emailed (via PortalEvents.USER_INVITED) and the user
   * picks their own password from the link, mirroring the OTP flow used for
   * workspace users.
   *
   * By default the user inherits the portal's project sharing (allProjects);
   * passing allProjects=false with projectIds limits them to those projects.
   *
   * @param ownerId userId
   */
  async create(
    ownerId: string,
    dto: CreatePortalUserDto,
  ): Promise<SafePortalUser> {
    const portal = await this.prisma.clientPortal.findFirst({
      where: { id: dto.clientPortalId, client: { workspace: { ownerId } } },
      select: {
        id: true,
        slug: true,
        clientId: true,
        client: { select: { workspace: { select: { name: true } } } },
      },
    });
    if (!portal) throw new NotFoundException('Client portal not found');

    const allProjects = dto.allProjects ?? true;
    const projectIds = await this.resolveProjectIds(
      portal.clientId,
      allProjects,
      dto.projectIds,
    );

    const email = normalizeEmail(dto.email);
    if (await this.emailTaken(portal.id, email)) {
      throw new ConflictException(
        'This email is already invited to this portal',
      );
    }

    const { token, otpSecret } = await this.issueInviteToken();
    // passwordHash is NOT NULL but no password exists until the invite is
    // accepted
    const placeholderHash = await bcrypt.hash(
      randomBytes(32).toString('hex'),
      SALT_ROUNDS,
    );

    const user = await this.prisma.clientPortalUser.create({
      data: {
        name: dto.name,
        email,
        passwordHash: placeholderHash,
        otpSecret,
        status: ClientPortalUserStatus.invited,
        allProjects,
        canApproveMilestones: dto.canApproveMilestones ?? true,
        clientPortalId: portal.id,
        projects: { create: projectIds.map((projectId) => ({ projectId })) },
      },
      omit: SAFE_OMIT,
      include: WITH_PROJECTS,
    });

    this.events.emit(PortalEvents.USER_INVITED, {
      email: user.email,
      name: user.name,
      portalSlug: portal.slug,
      workspaceName: portal.client.workspace.name,
      token,
    });

    return toSafePortalUser(user);
  }

  async findAll(
    ownerId: string,
    query: ListPortalUsersQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<SafePortalUser>> {
    const { cursor, take, clientPortalId, status } = query;
    const page = await this.pagination.paginate<UserRow>(
      this.prisma.clientPortalUser,
      {
        where: {
          clientPortal: {
            client: { workspace: this.workspaceScope.owned(ownerId) },
          },
          ...(clientPortalId ? { clientPortalId } : {}),
          ...(status ? { status } : {}),
        },
        omit: SAFE_OMIT,
        include: WITH_PROJECTS,
      },
      {
        cursor,
        take,
        orderBy: { createdAt: 'desc' },
        baseUrl,
        includeCount: true,
      },
    );
    return { ...page, results: page.results.map(toSafePortalUser) };
  }

  async findOne(ownerId: string, id: string): Promise<SafePortalUser> {
    return toSafePortalUser(await this.findRow(ownerId, id));
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdatePortalUserDto,
  ): Promise<SafePortalUser> {
    const existing = await this.findRow(ownerId, id);
    const {
      allProjects,
      projectIds,
      status,
      email: rawEmail,
      ...profile
    } = dto;

    if (
      status === ClientPortalUserStatus.active &&
      existing.status === ClientPortalUserStatus.invited
    ) {
      // An invited user has no password yet - "active" would lock them out
      // of both the invite link and the sign-in form.
      throw new BadRequestException(
        'This user has not accepted their invite yet - resend it instead',
      );
    }
    // Lifting a suspension on someone who never accepted their invite puts
    // them back to "invited", not "active": they still have no password, and
    // only an invited user can use an invite link.
    const nextStatus =
      status === ClientPortalUserStatus.active && !existing.emailVerifiedAt
        ? ClientPortalUserStatus.invited
        : status;

    const email = rawEmail === undefined ? undefined : normalizeEmail(rawEmail);
    const emailChanged = email !== undefined && email !== existing.email;
    if (
      emailChanged &&
      (await this.emailTaken(existing.clientPortalId, email, id))
    ) {
      throw new ConflictException('This email is already used in this portal');
    }
    // A pending invite's link carries the address it was sent to, so moving
    // the user to another address re-issues the invite there.
    const reinvite =
      emailChanged &&
      (nextStatus ?? existing.status) === ClientPortalUserStatus.invited;
    const invite = reinvite ? await this.issueInviteToken() : null;

    // Project access changes only when the request touches it; the list is
    // then replaced wholesale (and cleared when switching back to "all").
    let projects: Prisma.ClientPortalUserUpdateInput['projects'];
    const nextAllProjects = allProjects ?? existing.allProjects;
    if (allProjects !== undefined || projectIds !== undefined) {
      const ids = await this.resolveProjectIds(
        existing.clientPortal.clientId,
        nextAllProjects,
        projectIds ?? existing.projects.map((p) => p.projectId),
      );
      projects = {
        deleteMany: {},
        create: ids.map((projectId) => ({ projectId })),
      };
    }

    try {
      const user = await this.prisma.clientPortalUser.update({
        where: { id },
        data: {
          ...profile,
          ...(email !== undefined ? { email } : {}),
          ...(invite ? { otpSecret: invite.otpSecret } : {}),
          ...(nextStatus ? { status: nextStatus } : {}),
          ...(projects ? { allProjects: nextAllProjects, projects } : {}),
        },
        omit: SAFE_OMIT,
        include: WITH_PROJECTS,
      });
      if (invite) {
        this.events.emit(PortalEvents.USER_INVITED, {
          email: user.email,
          name: user.name,
          portalSlug: existing.clientPortal.slug,
          workspaceName: existing.clientPortal.client.workspace.name,
          token: invite.token,
        });
      }
      return toSafePortalUser(user);
    } catch (err) {
      if (this.isDuplicateEmail(err)) {
        throw new ConflictException(
          'This email is already used in this portal',
        );
      }
      throw err;
    }
  }

  /**
   * Issues a fresh invite link (the previous one stops working) and emails
   * it. Only for users who have not accepted yet - an active user resets
   * their password from the portal's own sign-in screen instead.
   */
  async resendInvite(ownerId: string, id: string): Promise<SafePortalUser> {
    const existing = await this.findRow(ownerId, id);
    if (existing.status !== ClientPortalUserStatus.invited) {
      throw new ConflictException(
        'This user has already accepted their invite',
      );
    }
    const { token, otpSecret } = await this.issueInviteToken();
    const user = await this.prisma.clientPortalUser.update({
      where: { id },
      data: { otpSecret },
      omit: SAFE_OMIT,
      include: WITH_PROJECTS,
    });
    this.events.emit(PortalEvents.USER_INVITED, {
      email: user.email,
      name: user.name,
      portalSlug: existing.clientPortal.slug,
      workspaceName: existing.clientPortal.client.workspace.name,
      token,
    });
    return toSafePortalUser(user);
  }

  async remove(ownerId: string, id: string): Promise<SafePortalUser> {
    const existing = await this.findRow(ownerId, id);
    await this.prisma.clientPortalUser.delete({ where: { id } });
    return toSafePortalUser(existing);
  }

  private async findRow(ownerId: string, id: string) {
    const user = await this.prisma.clientPortalUser.findFirst({
      where: { id, clientPortal: { client: { workspace: { ownerId } } } },
      omit: SAFE_OMIT,
      include: {
        ...WITH_PROJECTS,
        clientPortal: {
          select: {
            slug: true,
            clientId: true,
            client: { select: { workspace: { select: { name: true } } } },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('Portal user not found');
    const { clientPortal, ...row } = user;
    // clientPortal rides along for the callers that need it but is kept off
    // the row so it never leaks into a response through toSafePortalUser.
    return Object.defineProperty(row, 'clientPortal', {
      value: clientPortal,
      enumerable: false,
    }) as typeof row & { clientPortal: typeof clientPortal };
  }

  /**
   * The project list to store for a user: nothing while they see all
   * projects, otherwise the requested ids - which must be non-empty and all
   * belong to the portal's own client (never another client's projects).
   */
  private async resolveProjectIds(
    clientId: string,
    allProjects: boolean,
    projectIds: string[] | undefined,
  ): Promise<string[]> {
    if (allProjects) return [];
    const ids = [...new Set(projectIds ?? [])];
    if (ids.length === 0) {
      throw new BadRequestException(
        'Choose at least one project, or give access to all shared projects',
      );
    }
    const owned = await this.prisma.project.count({
      where: { id: { in: ids }, clientId },
    });
    if (owned !== ids.length) {
      throw new BadRequestException(
        "One or more projects do not belong to this portal's client",
      );
    }
    return ids;
  }

  private async issueInviteToken(): Promise<{
    token: string;
    otpSecret: string;
  }> {
    const token = randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(token, SALT_ROUNDS);
    return { token, otpSecret: `${tokenHash}:${Date.now() + INVITE_TTL_MS}` };
  }

  /** Case-insensitive, so rows stored before emails were lowercased count too. */
  private async emailTaken(
    clientPortalId: string,
    email: string,
    exceptId?: string,
  ): Promise<boolean> {
    const clash = await this.prisma.clientPortalUser.findFirst({
      where: {
        clientPortalId,
        email: { equals: email, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    return clash !== null;
  }

  private isDuplicateEmail(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    );
  }
}
