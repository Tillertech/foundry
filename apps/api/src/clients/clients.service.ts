import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PaginationRes,
  PaginationService,
} from '../common/pagination/pagination.service';
import type { ClientModel as Client } from '../generated/prisma/models';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { CreateClientDto } from './dto/create-client.dto';
import { ListClientsQueryDto } from './dto/list-clients-query.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly workspaces: WorkspacesService,
  ) {}

  async create(ownerId: string, dto: CreateClientDto): Promise<Client> {
    const { workspaceId, ...data } = dto;
    const workspace = workspaceId
      ? await this.workspaces.findOne(ownerId, workspaceId)
      : await this.workspaces.findDefault(ownerId);
    return this.prisma.client.create({
      data: { ...data, workspaceId: workspace.id },
    });
  }

  findAll(
    ownerId: string,
    query: ListClientsQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<Client>> {
    const { cursor, take, workspaceId, status, search } = query;
    return this.pagination.paginate<Client>(
      this.prisma.client,
      {
        where: {
          workspace: { ownerId, ...(workspaceId ? { id: workspaceId } : {}) },
          ...(status ? { status } : {}),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { email: { contains: search, mode: 'insensitive' } },
                  { company: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
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

  async findOne(ownerId: string, id: string): Promise<Client> {
    const client = await this.prisma.client.findFirst({
      where: { id, workspace: { ownerId } },
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateClientDto,
  ): Promise<Client> {
    await this.findOne(ownerId, id);
    return this.prisma.client.update({ where: { id }, data: dto });
  }

  async remove(ownerId: string, id: string): Promise<Client> {
    await this.findOne(ownerId, id);
    return this.prisma.client.delete({ where: { id } });
  }
}
