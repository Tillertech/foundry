import { Injectable, NotFoundException } from '@nestjs/common';
import { ClientsService } from '../clients/clients.service';
import {
  PaginationRes,
  PaginationService,
} from '../common/pagination/pagination.service';
import type { DocumentModel as Document } from '../generated/prisma/models';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { StorageService } from '../storage/storage.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { ListDocumentsQueryDto } from './dto/list-documents-query.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

/**
 * Documents with neither client nor project have no ownership chain in the
 * schema, so they are visible to all users; linked ones are owner-scoped.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly clients: ClientsService,
    private readonly projects: ProjectsService,
    private readonly storage: StorageService,
  ) {}

  private scope(ownerId: string) {
    return {
      OR: [
        { clientId: null, projectId: null },
        { client: { workspace: { ownerId } } },
        { project: { client: { workspace: { ownerId } } } },
      ],
    };
  }

  async create(ownerId: string, dto: CreateDocumentDto): Promise<Document> {
    if (dto.clientId) await this.clients.findOne(ownerId, dto.clientId);
    if (dto.projectId) await this.projects.findOne(ownerId, dto.projectId);
    return this.prisma.document.create({ data: dto });
  }

  findAll(
    ownerId: string,
    query: ListDocumentsQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<Document>> {
    const { cursor, take, clientId, projectId, type } = query;
    return this.pagination.paginate<Document>(
      this.prisma.document,
      {
        where: {
          AND: [
            this.scope(ownerId),
            {
              ...(clientId ? { clientId } : {}),
              ...(projectId ? { projectId } : {}),
              ...(type ? { type } : {}),
            },
          ],
        },
      },
      {
        cursor,
        take,
        orderBy: { uploadedAt: 'desc' },
        baseUrl,
        includeCount: true,
      },
    );
  }

  async findOne(ownerId: string, id: string): Promise<Document> {
    const document = await this.prisma.document.findFirst({
      where: { AND: [{ id }, this.scope(ownerId)] },
    });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateDocumentDto,
  ): Promise<Document> {
    await this.findOne(ownerId, id);
    if (dto.clientId) await this.clients.findOne(ownerId, dto.clientId);
    if (dto.projectId) await this.projects.findOne(ownerId, dto.projectId);
    return this.prisma.document.update({ where: { id }, data: dto });
  }

  /** Deletes the metadata record and the stored file. */
  async remove(ownerId: string, id: string): Promise<Document> {
    const document = await this.findOne(ownerId, id);
    await this.prisma.document.delete({ where: { id } });
    await this.storage.remove(document.storageKey);
    return document;
  }
}
