import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class MilestoneReviewCommentDto {
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'Deliverable the feedback is about; omit/null for the milestone as a whole',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deliverableId?: string | null;

  @ApiProperty({ example: 'Checkout fails with an M-Pesa timeout on Android 12' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body: string;
}

export class ReviewMilestoneDto {
  @ApiProperty({ enum: ['approve', 'request_changes'] })
  @IsIn(['approve', 'request_changes'])
  decision: 'approve' | 'request_changes';

  @ApiPropertyOptional({
    type: [MilestoneReviewCommentDto],
    description: 'Required (at least one) when requesting changes; optional notes when approving',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MilestoneReviewCommentDto)
  comments?: MilestoneReviewCommentDto[];

  @ApiPropertyOptional({
    default: false,
    description: 'The reviewer checked every acceptance criterion - required to approve a milestone that has criteria',
  })
  @IsOptional()
  @IsBoolean()
  criteriaConfirmed?: boolean;
}
