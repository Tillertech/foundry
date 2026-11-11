import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaymentMethod } from '../../generated/prisma/enums';
import { PortalBillingQueryDto } from '../billing/portal-billing-query.dto';

export class PortalPaymentsQueryDto extends PortalBillingQueryDto {
  @ApiPropertyOptional({
    enum: PaymentMethod,
    enumName: 'PaymentMethod',
    description: 'Only payments made this way',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;
}
