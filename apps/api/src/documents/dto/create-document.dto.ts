import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { DocumentType } from '../../generated/prisma/enums';

/**
 * Multipart body for POST /documents: metadata fields alongside the binary
 * `file` part (handled by multer). Storage key, size and mime type are
 * derived server-side from the uploaded file.
 */
export class CreateDocumentDto {
  @ApiPropertyOptional({
    example: 'Acme MSA v2.pdf',
    description: 'Defaults to the uploaded file name',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ enum: Object.values(DocumentType), enumName: 'DocumentType' })
  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;
}
