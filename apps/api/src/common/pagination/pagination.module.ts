import { Global, Module } from '@nestjs/common';
import { CursorService } from './cursor.service';
import { PaginationService } from './pagination.service';

@Global()
@Module({
  providers: [CursorService, PaginationService],
  exports: [CursorService, PaginationService],
})
export class PaginationModule {}
