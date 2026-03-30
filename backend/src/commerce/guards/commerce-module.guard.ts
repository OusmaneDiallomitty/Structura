import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';

@Injectable()
export class CommerceModuleGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.tenantId) {
      throw new ForbiddenException('Tenant introuvable');
    }

    const cacheKey = `tenant:moduleType:${user.tenantId}`;
    let moduleType = await this.cache.get<string>(cacheKey);

    if (!moduleType) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { moduleType: true },
      });
      moduleType = tenant?.moduleType ?? 'SCHOOL';
      // Cache 10 minutes — moduleType change rarement
      await this.cache.set(cacheKey, moduleType, 600);
    }

    if (moduleType !== 'COMMERCE') {
      throw new ForbiddenException(
        'Ce module est réservé aux tenants Commerce',
      );
    }

    return true;
  }
}
