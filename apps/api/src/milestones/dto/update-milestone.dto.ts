import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateMilestoneDto } from './create-milestone.dto';

// projectId is fixed at creation and order is only changed through the
// reorder endpoint, so neither is patchable here.
export class UpdateMilestoneDto extends PartialType(
  OmitType(CreateMilestoneDto, ['projectId', 'order'] as const),
) {}
