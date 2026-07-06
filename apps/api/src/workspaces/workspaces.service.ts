import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { WorkspaceModel as Workspace } from '../generated/prisma/models';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  create(ownerId: string, dto: CreateWorkspaceDto): Promise<Workspace> {
    return this.prisma.workspace.create({
      data: { ...dto, slug: this.slugify(dto.name), ownerId },
    });
  }

  /** Ordered oldest-first; the first workspace is the user's default. */
  findAll(ownerId: string): Promise<Workspace[]> {
    return this.prisma.workspace.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findDefault(ownerId: string): Promise<Workspace> {
    const workspace = await this.prisma.workspace.findFirst({
      where: { ownerId },
      orderBy: { createdAt: 'asc' },
    });
    if (!workspace) throw new NotFoundException('No workspace found');
    return workspace;
  }

  async findOne(ownerId: string, id: string): Promise<Workspace> {
    const workspace = await this.prisma.workspace.findFirst({
      where: { id, ownerId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace;
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateWorkspaceDto,
  ): Promise<Workspace> {
    await this.findOne(ownerId, id);
    return this.prisma.workspace.update({ where: { id }, data: dto });
  }

  async remove(ownerId: string, id: string): Promise<Workspace> {
    await this.findOne(ownerId, id);
    return this.prisma.workspace.delete({ where: { id } });
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
