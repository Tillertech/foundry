import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType } from '../../generated/prisma/enums';

export class DocumentEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Acme MSA v2.pdf' })
  name: string;

  @ApiProperty({ enum: Object.values(DocumentType), enumName: 'DocumentType' })
  type: DocumentType;

  @ApiProperty({ description: 'Storage key from POST /uploads' })
  storageKey: string;

  @ApiProperty({ description: 'Bytes' })
  size: number;

  @ApiPropertyOptional({ nullable: true, type: String })
  mimeType: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  notes: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'uuid' })
  clientId: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'uuid' })
  projectId: string | null;

  @ApiProperty()
  uploadedAt: Date;
}
