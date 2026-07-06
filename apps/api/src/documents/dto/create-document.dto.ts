import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { DocumentType } from '../../generated/prisma/enums';

export class CreateDocumentDto {
  @ApiProperty({ example: 'Acme MSA v2.pdf' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({ enum: Object.values(DocumentType), enumName: 'DocumentType' })
  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  @ApiProperty({ description: 'Storage key returned by POST /uploads' })
  @IsString()
  @MinLength(1)
  storageKey: string;

  @ApiPropertyOptional({ description: 'Bytes', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  size?: number;

  @ApiPropertyOptional({ example: 'application/pdf' })
  @IsOptional()
  @IsString()
  mimeType?: string;

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
