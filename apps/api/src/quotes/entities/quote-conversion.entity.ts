import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectEntity } from '../../projects/entities/project.entity';
import { QuoteEntity } from './quote.entity';

export class QuoteConversionEntity {
  @ApiProperty({ type: QuoteEntity })
  quote: QuoteEntity;

  @ApiProperty({ type: ProjectEntity })
  project: ProjectEntity;

  @ApiProperty({ description: 'Milestones generated from the quote lines' })
  milestoneCount: number;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Number of the upfront draft invoice, when one was requested and raised',
  })
  upfrontInvoiceNumber: string | null;
}
