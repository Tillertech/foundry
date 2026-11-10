import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LineItemDto } from '../../common/dto/line-item.dto';
import { QuoteItemKind } from '../../generated/prisma/enums';

/** A promised deliverable: just the label at quote time - evidence is added on the milestone. */
export class QuoteDeliverableDto {
  @ApiProperty({ description: 'Client-generated id, kept on the milestone after conversion' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id: string;

  @ApiProperty({ example: 'Signed-off MVP feature list' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  label: string;
}

export class QuoteLineItemDto extends LineItemDto {
  @ApiPropertyOptional({
    enum: Object.values(QuoteItemKind),
    enumName: 'QuoteItemKind',
    default: QuoteItemKind.standard,
    description:
      'standard/milestone count towards the total; recurring is per month and pass_through at cost (both quoted separately); option counts only when selected',
  })
  @IsOptional()
  @IsEnum(QuoteItemKind)
  kind?: QuoteItemKind;

  @ApiPropertyOptional({
    description: 'Longer client-facing scope text (becomes the milestone description)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  details?: string;

  @ApiPropertyOptional({
    type: [QuoteDeliverableDto],
    description: 'Milestone/option lines: what will be handed over (becomes the milestone checklist)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuoteDeliverableDto)
  deliverables?: QuoteDeliverableDto[];

  @ApiPropertyOptional({
    description: 'Milestone/option lines: what the client checks before signing off',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  acceptanceCriteria?: string;

  @ApiPropertyOptional({ example: 40, description: 'Hours estimate (milestone lines)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedHours?: number;

  @ApiPropertyOptional({ default: false, description: 'Options only: picked by the client' })
  @IsOptional()
  @IsBoolean()
  selected?: boolean;
}
