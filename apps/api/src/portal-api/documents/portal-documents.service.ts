import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PaginationRes,
  PaginationService,
} from '../../common/pagination/pagination.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { DocumentModel as Document } from '../../generated/prisma/models';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { PortalContextService } from '../portal-context.service';

export type SafeDocument = Omit<Document, 'storageKey'>;

/** storageKey is a raw filesystem path / S3 object key - never return it to a portal user. */
const SAFE_OMIT = { storageKey: true } as const;

@Injectable()
export class PortalDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: PaginationService,
    private readonly context: PortalContextService,
    private readonly storage: StorageService,
  ) {}

  private async scope(clientPortalId: string) {
    const { clientId } = await this.context.require(
      clientPortalId,
      'viewDocuments',
    );
    const projectIds = await this.context.sharedProjectIds(clientPortalId);
    return {
      OR: [{ clientId }, { projectId: { in: projectIds } }],
    };
  }

  async findAll(
    clientPortalId: string,
    query: PaginationQueryDto,
    baseUrl: string,
  ): Promise<PaginationRes<SafeDocument>> {
    const where = await this.scope(clientPortalId);
    return this.pagination.paginate<SafeDocument>(
      this.prisma.document,
      { where, omit: SAFE_OMIT },
      {
        cursor: query.cursor,
        take: query.take,
        orderBy: { uploadedAt: 'desc' },
        baseUrl,
        includeCount: true,
      },
    );
  }

  async findOne(clientPortalId: string, id: string): Promise<SafeDocument> {
    const where = await this.scope(clientPortalId);
    const document = await this.prisma.document.findFirst({
      where: { AND: [{ id }, where] },
      omit: SAFE_OMIT,
    });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  /**
   * Returns the full row (storageKey included) since the controller only
   * reads name/mimeType off it to set headers - it never serializes this
   * object back to the client, unlike findAll/findOne.
   */
  async download(
    clientPortalId: string,
    id: string,
  ): Promise<{ document: Document; content: Buffer }> {
    const where = await this.scope(clientPortalId);
    const document = await this.prisma.document.findFirst({
      where: { AND: [{ id }, where] },
    });
    if (!document) throw new NotFoundException('Document not found');
    const content = await this.storage.read(document.storageKey);
    return { document, content };
  }
}
