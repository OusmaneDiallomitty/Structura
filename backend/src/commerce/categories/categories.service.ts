import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { CreateCategoryDto } from './dto/create-category.dto';

const TTL = 300; // 5 minutes

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private cacheKey(tenantId: string) {
    return `commerce:categories:${tenantId}`;
  }

  private async invalidate(tenantId: string) {
    await this.cache.del(this.cacheKey(tenantId));
  }

  async findAll(tenantId: string) {
    const cached = await this.cache.get<any[]>(this.cacheKey(tenantId));
    if (cached) return cached;

    const categories = await this.prisma.productCategory.findMany({
      where: { tenantId },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { products: { where: { isActive: true } } } },
      },
    });

    await this.cache.set(this.cacheKey(tenantId), categories, TTL);
    return categories;
  }

  async create(tenantId: string, dto: CreateCategoryDto) {
    const exists = await this.prisma.productCategory.findUnique({
      where: { tenantId_name: { tenantId, name: dto.name } },
    });
    if (exists) {
      throw new ConflictException(`Catégorie "${dto.name}" existe déjà`);
    }

    const category = await this.prisma.productCategory.create({
      data: { tenantId, ...dto },
    });

    await this.invalidate(tenantId);
    return category;
  }

  async update(tenantId: string, id: string, dto: Partial<CreateCategoryDto>) {
    await this.findOne(tenantId, id);

    if (dto.name) {
      const conflict = await this.prisma.productCategory.findFirst({
        where: { tenantId, name: dto.name, NOT: { id } },
      });
      if (conflict) {
        throw new ConflictException(`Catégorie "${dto.name}" existe déjà`);
      }
    }

    const updated = await this.prisma.productCategory.update({
      where: { id },
      data: dto,
    });

    await this.invalidate(tenantId);
    return updated;
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    const hasProducts = await this.prisma.product.count({
      where: { categoryId: id, tenantId },
    });
    if (hasProducts > 0) {
      throw new ConflictException(
        'Impossible de supprimer une catégorie contenant des produits',
      );
    }

    await this.prisma.productCategory.delete({ where: { id } });
    await this.invalidate(tenantId);
  }

  private async findOne(tenantId: string, id: string) {
    const category = await this.prisma.productCategory.findFirst({
      where: { id, tenantId },
    });
    if (!category) throw new NotFoundException('Catégorie introuvable');
    return category;
  }
}
