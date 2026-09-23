import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateMilestoneDto } from './create-milestone.dto';

export class UpdateMilestoneDto extends PartialType(
  OmitType(CreateMilestoneDto, ['projectId', 'order'] as const),
) {}
