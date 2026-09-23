import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientsService } from '../clients/clients.service';
import { DocumentEvents, FileEvents } from '../common/events';
import {
  PaginationRes,
  PaginationService,
} from '../common/pagination/pagination.service';
import type { DocumentModel as Document } from '../generated/prisma/models';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { StorageService } from '../storage/storage.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { ListDocumentsQueryDto } from './dto/list-documents-query.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

/**
 * Every document belongs to exactly one workspace (its own `workspaceId`,
 * kept in step with its client/project), and every query is scoped through
 * that workspace's owner - so a document is never visible across tenants,
 * linked or not. Legacy rows with no workspace match no one.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly clients: ClientsService,
    private readonly projects: ProjectsService,
    private readonly storage: StorageService,
    private readonly events: EventEmitter2,
    private readonly workspaces: WorkspacesService,
  ) {}

  private scope(ownerId: string) {
    return { workspace: { ownerId } };
  }

  /** Stores the uploaded file and registers its metadata in one call. */
  async create(
    ownerId: string,
    dto: CreateDocumentDto,
    file: Express.Multer.File,
  ): Promise<Document> {
    const { workspaceId: requested, ...data } = dto;
    // Resolve (and authorise) the links before anything touches storage.
    const linked = await this.linkedWorkspace(
      ownerId,
      dto.clientId,
      dto.projectId,
    );
    if (linked && requested && requested !== linked) {
      throw new BadRequestException(
        'The client/project belongs to a different workspace than the one requested',
      );
    }
    const workspaceId =
      linked ??
      (requested
        ? await this.workspaces.findOne(ownerId, requested)
        : await this.workspaces.findDefault(ownerId)
      ).id;
    const stored = await this.storage.upload(file);
    this.events.emit(FileEvents.UPLOADED, stored);
    return this.prisma.document.create({
      data: {
        ...data,
        workspaceId,
        name: dto.name ?? stored.originalName,
        storageKey: stored.key,
        size: stored.size,
        mimeType: stored.mimeType,
      },
    });
  }

  findAll(
    ownerId: string,
    query: ListDocumentsQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<Document>> {
    const { cursor, take, clientId, projectId, workspaceId, type } = query;
    return this.pagination.paginate<Document>(
      this.prisma.document,
      {
        where: {
          workspace: { ownerId, ...(workspaceId ? { id: workspaceId } : {}) },
          ...(clientId ? { clientId } : {}),
          ...(projectId ? { projectId } : {}),
          ...(type ? { type } : {}),
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
      where: { id, ...this.scope(ownerId) },
    });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateDocumentDto,
  ): Promise<Document> {
    const existing = await this.findOne(ownerId, id);
    // Validate the links the document will end up with - a change to just
    // one side must still agree with the side that isn't being changed.
    const clientId =
      dto.clientId !== undefined ? dto.clientId : existing.clientId;
    const projectId =
      dto.projectId !== undefined ? dto.projectId : existing.projectId;
    const relinked =
      (dto.clientId !== undefined || dto.projectId !== undefined) &&
      (await this.linkedWorkspace(ownerId, clientId, projectId));
    // Relinking moves the document into that client's workspace; unlinking
    // entirely leaves it where it is.
    return this.prisma.document.update({
      where: { id },
      data: { ...dto, ...(relinked ? { workspaceId: relinked } : {}) },
    });
  }

  /**
   * The workspace implied by a client and/or project link, after checking
   * both are the caller's - and, when both are set, that the project is that
   * client's. (Otherwise a document filed under client B but on client A's
   * project would show up in client A's portal, which lists documents on
   * its shared projects.) null when neither is linked.
   */
  private async linkedWorkspace(
    ownerId: string,
    clientId: string | null | undefined,
    projectId: string | null | undefined,
  ): Promise<string | null> {
    const client = clientId
      ? await this.clients.findOne(ownerId, clientId)
      : null;
    const project = projectId
      ? await this.projects.findOne(ownerId, projectId)
      : null;
    if (client && project && project.clientId !== client.id) {
      throw new BadRequestException(
        "The project belongs to a different client than the document's",
      );
    }
    if (client) return client.workspaceId;
    if (!project) return null;
    const projectClient = await this.clients.findOne(ownerId, project.clientId);
    return projectClient.workspaceId;
  }

  /** The document plus its stored bytes, for downloads and previews. */
  async download(
    ownerId: string,
    id: string,
  ): Promise<{ document: Document; content: Buffer }> {
    const document = await this.findOne(ownerId, id);
    const content = await this.storage.read(document.storageKey);
    return { document, content };
  }

  /**
   * Emails the document to the client it belongs to (attachment); the
   * notification pipeline sends the mail and records the in-app notice.
   */
  async share(ownerId: string, id: string): Promise<Document> {
    const document = await this.findOne(ownerId, id);
    if (!document.clientId) {
      throw new BadRequestException(
        'Document is not linked to a client - link it before sharing',
      );
    }
    const client = await this.clients.findOne(ownerId, document.clientId);
    this.events.emit(DocumentEvents.SHARED, { document, client });
    return document;
  }

  /** Deletes the metadata record and the stored file. */
  async remove(ownerId: string, id: string): Promise<Document> {
    const document = await this.findOne(ownerId, id);
    await this.prisma.document.delete({ where: { id } });
    await this.storage.remove(document.storageKey);
    return document;
  }
}
