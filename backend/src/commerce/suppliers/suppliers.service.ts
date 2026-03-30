import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';

const TTL = 300;

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private listKey(tenantId: string) {
    return `commerce:suppliers:${tenantId}`;
  }

  private async invalidate(tenantId: string) {
    await this.cache.del(this.listKey(tenantId));
  }

  async findAll(tenantId: string) {
    const cached = await this.cache.get<any[]>(this.listKey(tenantId));
    if (cached) return cached;

    const suppliers = await this.prisma.supplier.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: 'asc' },
    });

    await this.cache.set(this.listKey(tenantId), suppliers, TTL);
    return suppliers;
  }

  async create(tenantId: string, dto: CreateSupplierDto) {
    const supplier = await this.prisma.supplier.create({
      data: { tenantId, ...dto },
    });
    await this.invalidate(tenantId);
    return supplier;
  }

  async update(tenantId: string, id: string, dto: Partial<CreateSupplierDto>) {
    const existing = await this.prisma.supplier.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Fournisseur introuvable');

    const updated = await this.prisma.supplier.update({
      where: { id },
      data: dto,
    });
    await this.invalidate(tenantId);
    return updated;
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.supplier.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Fournisseur introuvable');

    await this.prisma.supplier.update({
      where: { id },
      data: { isActive: false },
    });
    await this.invalidate(tenantId);
  }
}
