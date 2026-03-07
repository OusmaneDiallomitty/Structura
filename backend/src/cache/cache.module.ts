import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';

/**
 * Module global — CacheService injectable dans toute l'application
 * sans avoir à importer CacheModule dans chaque feature module.
 */
@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
