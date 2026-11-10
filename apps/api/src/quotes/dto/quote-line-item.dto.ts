import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { LineItemDto } from '../../common/dto/line-item.dto';
import { QuoteItemKind } from '../../generated/prisma/enums';

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
