import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsUrl,
  MaxLength,
  ValidateNested,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import {
  MilestoneBillingTrigger,
  MilestoneStatus,
} from '../../generated/prisma/enums';

export class DeliverableLinkDto {
  @ApiProperty({ example: 'Staging build' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label: string;

  @ApiProperty({ example: 'https://staging.example.com' })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2000)
  url: string;
}

export class MilestoneDeliverableDto {
  @ApiProperty({ description: 'Client-generated id, stable across edits' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  id: string;

  @ApiProperty({ example: 'Signed-off wireframes' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  label: string;

  @ApiProperty({ default: false })
  @IsBoolean()
  done: boolean;

  @ApiPropertyOptional({
    description: 'What was done / what to look at - shown to the client when reviewing',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({ type: [DeliverableLinkDto], description: 'Evidence: builds, staging URLs, recordings' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DeliverableLinkDto)
  links?: DeliverableLinkDto[];

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: "Evidence files: documents of this project or its client",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  documentIds?: string[];
}

export class CreateMilestoneDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  projectId: string;

  @ApiProperty({ example: 'Design approval' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    enum: Object.values(MilestoneStatus),
    enumName: 'MilestoneStatus',
    default: MilestoneStatus.not_started,
  })
  @IsOptional()
  @IsEnum(MilestoneStatus)
  status?: MilestoneStatus;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ example: 12, description: 'Optional hours estimate' })
  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Position within the project milestone list (lower sorts first); appended to the end when omitted',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({
    example: 50000,
    nullable: true,
    description: "Fixed price in the client's currency; null/omitted = not billed per milestone",
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number | null;

  @ApiPropertyOptional({
    enum: Object.values(MilestoneBillingTrigger),
    enumName: 'MilestoneBillingTrigger',
    default: MilestoneBillingTrigger.on_acceptance,
  })
  @IsOptional()
  @IsEnum(MilestoneBillingTrigger)
  billingTrigger?: MilestoneBillingTrigger;

  @ApiPropertyOptional({
    default: false,
    description: "Final milestone: its invoice releases the project's retained amounts",
  })
  @IsOptional()
  @IsBoolean()
  releasesRetention?: boolean;

  @ApiPropertyOptional({ type: [MilestoneDeliverableDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MilestoneDeliverableDto)
  deliverables?: MilestoneDeliverableDto[];

  @ApiPropertyOptional({ description: 'What the client checks before signing off' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  acceptanceCriteria?: string;

  @ApiPropertyOptional({
    example: 'Jane Doe (jane@client.com)',
    description: 'Who signed off; recorded when the status moves to accepted',
  })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  acceptedBy?: string;
}
