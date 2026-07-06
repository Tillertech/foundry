import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, Min, MinLength } from 'class-validator';

/** Shared shape for invoice and quote line items. */
export class LineItemDto {
  @ApiProperty({ example: 'Design sprint - week 3' })
  @IsString()
  @MinLength(1)
  description: string;

  @ApiProperty({ example: 40, default: 1 })
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiProperty({ example: 150, default: 0 })
  @IsNumber()
  @Min(0)
  rate: number;
}

export class LineItemEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ type: String, description: 'Decimal serialized as string', example: '40' })
  quantity: string;

  @ApiProperty({ type: String, example: '150' })
  rate: string;
}
