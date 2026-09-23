import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateExpenseDto } from './create-expense.dto';

/**
 * The workspace isn't directly editable: it follows the project when the
 * expense is (re)assigned to one, and otherwise stays where it was created.
 */
export class UpdateExpenseDto extends PartialType(
  OmitType(CreateExpenseDto, ['workspaceId'] as const),
) {}
