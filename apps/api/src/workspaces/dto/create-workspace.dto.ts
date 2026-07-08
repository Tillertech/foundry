import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ClientStatus, Currency } from '../../generated/prisma/enums';

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'Acme Studio' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  name: string;

  @ApiPropertyOptional({
    enum: Object.values(Currency),
    enumName: 'Currency',
    default: Currency.USD,
  })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({
    enum: Object.values(ClientStatus),
    enumName: 'ClientStatus',
    default: ClientStatus.active,
  })
  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @ApiPropertyOptional({
    default: false,
    description: 'Send scheduled invoice due-date reminder emails',
  })
  @IsOptional()
  @IsBoolean()
  remindersEnabled?: boolean;

  @ApiPropertyOptional({
    default: 3,
    minimum: 1,
    maximum: 30,
    description:
      'Days before the due date reminders start (also the re-send interval)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  reminderDaysBefore?: number;
}
