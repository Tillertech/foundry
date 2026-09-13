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
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { ClientPortalModel as ClientPortal } from '../generated/prisma/models';
import { ClientsService } from '../clients/clients.service';
import { PortalUsersService } from '../portal-users/portal-users.service';

const MAX_SLUG_ATTEMPTS = 5;
// claude --resume c5add1a7-14fc-40af-8df9-7d93e226c678
@Injectable()
export class ClientPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientService: ClientsService,
    private readonly pagination: PaginationService,
    private readonly portalUsers: PortalUsersService,
  ) {}

  async create(
    ownerId: string,
    dto: CreateClientPortalDto,
  ): Promise<ClientPortal> {
    const client = await this.clientService.findOne(ownerId, dto.clientId);

    const existing = await this.prisma.clientPortal.findUnique({
      where: { clientId: client.id },
      include: { permission: true },
    });
    if (existing) return existing;

    const projects = await this.prisma.project.findMany({
      where: { clientId: client.id },
      select: { id: true },
    });

    let portal: ClientPortal | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
      const slug = this.generateSlug(client.name, attempt);
      try {
        portal = await this.prisma.clientPortal.create({
          data: {
            slug,
            clientId: client.id,
            permission: { create: {} },
            clientPortalProjects: {
              create: projects.map((project) => ({ projectId: project.id })),
            },
          },
          include: { permission: true },
        });
        break;
      } catch (err) {
        if (!this.isDuplicateSlug(err)) throw err;
        lastError = err;
      }
    }
    if (!portal) {
      throw new ConflictException(
        'Could not generate a unique portal slug, please retry',
        { cause: lastError },
      );
    }

    await this.portalUsers.create(ownerId, {
      clientPortalId: portal.id,
      name: client.name,
      email: client.email,
    });

    return portal;
  }

  findAll(
    ownerId: string,
    query: ListClientPortalsQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<ClientPortal>> {
    const { cursor, take, clientId, active } = query;
    return this.pagination.paginate<ClientPortal>(
      this.prisma.clientPortal,
      {
        where: {
          client: { workspace: { ownerId } },
          ...(clientId ? { clientId } : {}),
          ...(active !== undefined ? { active } : {}),
        },
        include: {
          permission: true,
          clientPortalUsers: {
            select: {
              id: true,
              name: true,
              email: true,
              status: true,
              emailVerifiedAt: true,
            }
          },
          clientPortalProjects: {
            select: {
              id: true,
              active: true,
              project: { select: { id: true, name: true, status: true } },
            },
          },
        },
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

  async findOne(ownerId: string, id: string): Promise<ClientPortal> {
    const portal = await this.prisma.clientPortal.findFirst({
      where: { id, client: { workspace: { ownerId } } },
      include: { permission: true },
    });
    if (!portal) throw new NotFoundException('Client portal not found');
    return portal;
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateClientPortalDto,
  ): Promise<ClientPortal> {
    await this.findOne(ownerId, id);
    const { active, viewProjects, viewDocuments, viewQuotes, viewPayments } =
      dto;
    const permissionPatch = {
      ...(viewProjects !== undefined ? { viewProjects } : {}),
      ...(viewDocuments !== undefined ? { viewDocuments } : {}),
      ...(viewQuotes !== undefined ? { viewQuotes } : {}),
      ...(viewPayments !== undefined ? { viewPayments } : {}),
    };

    return this.prisma.clientPortal.update({
      where: { id },
      data: {
        ...(active !== undefined ? { active } : {}),
        ...(Object.keys(permissionPatch).length
          ? { permission: { update: permissionPatch } }
          : {}),
      },
      include: { permission: true },
    });
  }

  async remove(ownerId: string, id: string): Promise<ClientPortal> {
    await this.findOne(ownerId, id);
    return this.prisma.clientPortal.delete({ where: { id } });
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
