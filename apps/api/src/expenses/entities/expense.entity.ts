import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency, ExpenseCategory } from '../../generated/prisma/enums';

export class ExpenseEntity {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Figma' })
  vendor: string;

  @ApiProperty({ enum: Object.values(ExpenseCategory), enumName: 'ExpenseCategory' })
  category: ExpenseCategory;

  @ApiProperty({ type: String, description: 'Decimal serialized as string', example: '45' })
  amount: string;

  @ApiProperty({ enum: Object.values(Currency), enumName: 'Currency' })
  currency: Currency;

  @ApiProperty()
  date: Date;

  @ApiProperty()
  billable: boolean;

  @ApiPropertyOptional({ nullable: true, type: String })
  notes: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'uuid' })
  projectId: string | null;
}
