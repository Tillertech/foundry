import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * The portal (`active`) and its permissions are updated together here since
 * PortalPermission is a 1:1 child of the ClientPortal aggregate, not a
 * separately-owned resource. clientId is intentionally absent - the portal
 * is addressed by :id and is never re-parented to a different client.
 */
export class UpdateClientPortalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  viewProjects?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  viewDocuments?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  viewQuotes?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  viewPayments?: boolean;
}
