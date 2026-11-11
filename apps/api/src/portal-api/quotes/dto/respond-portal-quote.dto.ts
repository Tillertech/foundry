import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class AcceptPortalQuoteDto {
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      "Option lines the client wants included; every other option is left out. Omit to keep the options as quoted.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  optionIds?: string[];
}

export class DeclinePortalQuoteDto {
  @ApiPropertyOptional({ example: 'Budget moved to next quarter', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
