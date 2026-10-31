import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateClientPortalDto } from './dto/create-client-portal.dto';
import { UpdateClientPortalDto } from './dto/update-client-portal.dto';
import { ListClientPortalsQueryDto } from './dto/list-client-portals-query.dto';
import {
  PaginationRes,
  PaginationService,
} from '../common/pagination/pagination.service';
import {
  effectivePortalPermission,
  PORTAL_PERMISSION_FLAGS,
  PortalPermissionFlags,
  WORKSPACE_PORTAL_DEFAULTS_SELECT,
} from '../common/portal-permissions';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { ClientsService } from '../clients/clients.service';
import {
  PortalUsersService,
  SafePortalUser,
  toSafePortalUser,
} from '../portal-users/portal-users.service';
import { WorkspaceScope } from '../common/workspace-scope/workspace-scope';

const MAX_SLUG_ATTEMPTS = 5;

/**
 * Everything the workspace-owner admin UI needs about a portal in one read:
 * its permission row, its users (with their project access) and its project
 * shares. `client.workspace` is only loaded to resolve the effective
 * permission and is dropped again by present().
 */
const PORTAL_INCLUDE = {
  permission: true,
  client: {
    select: { workspace: { select: WORKSPACE_PORTAL_DEFAULTS_SELECT } },
  },
  clientPortalUsers: {
    orderBy: { createdAt: 'asc' },
    omit: { passwordHash: true, otpSecret: true },
    include: { projects: { select: { projectId: true } } },
  },
  clientPortalProjects: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      active: true,
      project: { select: { id: true, name: true, status: true } },
    },
  },
} satisfies Prisma.ClientPortalInclude;

type PortalRow = Prisma.ClientPortalGetPayload<{
  include: typeof PORTAL_INCLUDE;
}>;

export type ClientPortalView = Omit<
  PortalRow,
  'client' | 'clientPortalUsers'
> & {
  /** Workspace defaults while the portal inherits, its own flags otherwise. */
  effectivePermission: PortalPermissionFlags;
  clientPortalUsers: SafePortalUser[];
};

@Injectable()
export class ClientPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientService: ClientsService,
    private readonly pagination: PaginationService,
    private readonly portalUsers: PortalUsersService,
    private readonly workspaceScope: WorkspaceScope,
  ) {}

  /**
   * Provisions a client's portal (or returns the one it already has). A new
   * portal inherits the workspace's default permissions, shares all of the
   * client's existing projects and invites the client's own email as its
   * first user.
   */
  async create(
    ownerId: string,
    dto: CreateClientPortalDto,
  ): Promise<ClientPortalView> {
    const client = await this.clientService.findOne(ownerId, dto.clientId);

    const existing = await this.prisma.clientPortal.findUnique({
      where: { clientId: client.id },
      select: { id: true },
    });
    if (existing) return this.findOne(ownerId, existing.id);

    const projects = await this.prisma.project.findMany({
      where: { clientId: client.id },
      select: { id: true },
    });

    let portalId: string | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
      const slug = this.generateSlug(client.name, attempt);
      try {
        const portal = await this.prisma.clientPortal.create({
          data: {
            slug,
            clientId: client.id,
            // inherit defaults to true: the portal follows the workspace.
            permission: { create: {} },
            clientPortalProjects: {
              create: projects.map((project) => ({ projectId: project.id })),
            },
          },
          select: { id: true },
        });
        portalId = portal.id;
        break;
      } catch (err) {
        if (!this.isDuplicateSlug(err)) throw err;
        lastError = err;
      }
    }
    if (!portalId) {
      throw new ConflictException(
        'Could not generate a unique portal slug, please retry',
        { cause: lastError },
      );
    }

    await this.portalUsers.create(ownerId, {
      clientPortalId: portalId,
      name: client.name,
      email: client.email,
    });

    return this.findOne(ownerId, portalId);
  }

  async findAll(
    ownerId: string,
    query: ListClientPortalsQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<ClientPortalView>> {
    const { cursor, take, clientId, active } = query;
    const page = await this.pagination.paginate<PortalRow>(
      this.prisma.clientPortal,
      {
        where: {
          client: { workspace: this.workspaceScope.owned(ownerId) },
          ...(clientId ? { clientId } : {}),
          ...(active !== undefined ? { active } : {}),
        },
        include: PORTAL_INCLUDE,
      },
      {
        cursor,
        take,
        orderBy: { createdAt: 'desc' },
        baseUrl,
        includeCount: true,
      },
    );
    return { ...page, results: page.results.map((row) => this.present(row)) };
  }

  async findOne(ownerId: string, id: string): Promise<ClientPortalView> {
    const portal = await this.prisma.clientPortal.findFirst({
      where: { id, client: { workspace: { ownerId } } },
      include: PORTAL_INCLUDE,
    });
    if (!portal) throw new NotFoundException('Client portal not found');
    return this.present(portal);
  }

  /**
   * Toggles the portal and/or its permissions. Permissions either follow
   * the workspace defaults (inheritPermissions: true) or are the portal's
   * own; sending any view flag on its own switches the portal to its own.
   */
  async update(
    ownerId: string,
    id: string,
    dto: UpdateClientPortalDto,
  ): Promise<ClientPortalView> {
    await this.findOne(ownerId, id);
    const { active, inheritPermissions } = dto;
    const flags: Partial<PortalPermissionFlags> = {};
    for (const flag of PORTAL_PERMISSION_FLAGS) {
      if (dto[flag] !== undefined) flags[flag] = dto[flag];
    }
    const touchesFlags = Object.keys(flags).length > 0;
    const inherit = inheritPermissions ?? (touchesFlags ? false : undefined);
    const permissionPatch = {
      ...flags,
      ...(inherit !== undefined ? { inherit } : {}),
    };

    await this.prisma.clientPortal.update({
      where: { id },
      data: {
        ...(active !== undefined ? { active } : {}),
        ...(Object.keys(permissionPatch).length
          ? { permission: { update: permissionPatch } }
          : {}),
      },
      select: { id: true },
    });
    return this.findOne(ownerId, id);
  }

  /**
   * Shares a project into the portal or hides it again. The project has to
   * belong to the portal's own client; unsharing hides it from every portal
   * user, including ones it was specifically assigned to.
   */
  async setProjectShared(
    ownerId: string,
    id: string,
    projectId: string,
    active: boolean,
  ): Promise<ClientPortalView> {
    const portal = await this.findOne(ownerId, id);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, clientId: portal.clientId },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException("Project not found for this portal's client");
    }
    await this.prisma.clientPortalProject.upsert({
      where: {
        clientPortalId_projectId: { clientPortalId: id, projectId },
      },
      create: { clientPortalId: id, projectId, active },
      update: { active },
    });
    return this.findOne(ownerId, id);
  }

  async remove(ownerId: string, id: string): Promise<ClientPortalView> {
    const portal = await this.findOne(ownerId, id);
    await this.prisma.clientPortal.delete({ where: { id } });
    return portal;
  }

  private present({
    client,
    clientPortalUsers,
    ...portal
  }: PortalRow): ClientPortalView {
    return {
      ...portal,
      effectivePermission: portal.permission
        ? effectivePortalPermission(portal.permission, client.workspace)
        : {
            viewProjects: false,
            viewDocuments: false,
            viewQuotes: false,
            viewPayments: false,
          },
      clientPortalUsers: clientPortalUsers.map(toSafePortalUser),
    };
  }

  /** `acme-studio`, then `acme-studio-2`, `acme-studio-3`, ... on collision. */
  private generateSlug(name: string, attempt: number): string {
    const base =
      name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'client';
    return attempt === 0 ? base : `${base}-${attempt + 1}`;
  }

  private isDuplicateSlug(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    );
  }
}
