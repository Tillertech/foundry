import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateDocumentDto } from './create-document.dto';

/**
 * The workspace isn't directly editable: it follows the client/project when
 * the document is (re)linked, and otherwise stays where it was uploaded.
 */
export class UpdateDocumentDto extends PartialType(
  OmitType(CreateDocumentDto, ['workspaceId'] as const),
) {}
