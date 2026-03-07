import { Module } from '@nestjs/common';
import { DjomyService } from './djomy.service';

@Module({
  providers: [DjomyService],
  exports: [DjomyService],
})
export class DjomyModule {}
