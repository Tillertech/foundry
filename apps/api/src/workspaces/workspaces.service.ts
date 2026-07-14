import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { WorkspaceModel as Workspace } from '../generated/prisma/models';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';

/** Logo uploads must be embeddable in invoice PDFs - pdfmake only renders PNG and JPEG. */
const LOGO_MIME_TYPES = ['image/png', 'image/jpeg'];

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

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
    const workspace = await this.findOne(ownerId, id);
    if (workspace.storageKey) await this.storage.remove(workspace.storageKey);
    return this.prisma.workspace.delete({ where: { id } });
  }

  async uploadLogo(
    ownerId: string,
    id: string,
    file: Express.Multer.File,
  ): Promise<Workspace> {
    if (!LOGO_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Logo must be a PNG or JPEG image');
    }
    const workspace = await this.findOne(ownerId, id);
    const stored = await this.storage.upload(file);
    if (workspace.storageKey) await this.storage.remove(workspace.storageKey);
    return this.prisma.workspace.update({
      where: { id },
      data: { storageKey: stored.key },
    });
  }

  async readLogo(
    ownerId: string,
    id: string,
  ): Promise<{ content: Buffer; mimeType: string }> {
    const workspace = await this.findOne(ownerId, id);
    if (!workspace.storageKey) {
      throw new NotFoundException('Workspace has no logo');
    }
    const content = await this.storage.read(workspace.storageKey);
    return { content, mimeType: logoMimeType(workspace.storageKey) };
  }

  async removeLogo(ownerId: string, id: string): Promise<Workspace> {
    const workspace = await this.findOne(ownerId, id);
    if (workspace.storageKey) await this.storage.remove(workspace.storageKey);
    return this.prisma.workspace.update({
      where: { id },
      data: { storageKey: null },
    });
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

export function logoMimeType(storageKey: string): string {
  return storageKey.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
}
