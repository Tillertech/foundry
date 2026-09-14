import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType } from '../../../generated/prisma/enums';

export class PortalDocumentEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Acme MSA v2.pdf' })
  name: string;

  @ApiProperty({ enum: Object.values(DocumentType), enumName: 'DocumentType' })
  type: DocumentType;

  @ApiPropertyOptional({ nullable: true, type: String })
  mimeType: string | null;

  @ApiProperty({ description: 'Bytes' })
  size: number;

  @ApiProperty()
  uploadedAt: Date;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'uuid' })
  projectId: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  notes: string | null;
}
