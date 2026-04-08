import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { ConfigureConversionDto } from './dtos/configure-conversion.dto';
import { ReceiveStockDto } from './dtos/receive-stock.dto';

const TTL = 300; // 5 minutes — invalidé immédiatement à chaque mutation

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private listKey(tenantId: string) {
    return `commerce:products:list:${tenantId}`;
  }

  private alertsKey(tenantId: string) {
    return `commerce:products:alerts:${tenantId}`;
  }

  private async invalidate(tenantId: string) {
    await Promise.all([
      this.cache.del(this.listKey(tenantId)),
      this.cache.del(this.alertsKey(tenantId)),
    ]);
  }

  async findAll(
    tenantId: string,
    filters: {
      search?: string;
      categoryId?: string;
      lowStock?: boolean;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const { search, categoryId, lowStock, page = 1, limit = 50 } = filters;

    // Pagination uniquement en cache si pas de filtre dynamique
    const isDefaultQuery = !search && !categoryId && !lowStock && page === 1;
    if (isDefaultQuery) {
      const cached = await this.cache.get<any>(this.listKey(tenantId));
      if (cached) return cached;
    }

    const where: any = { tenantId, isActive: true };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (categoryId) where.categoryId = categoryId;
    if (lowStock) {
      where.AND = [
        { stockQty: { lte: this.prisma.$queryRaw`"stockAlert"` } },
      ];
    }

    const skip = (page - 1) * limit;
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { category: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    const result = {
      data: products,
      total,
      page,
      pageCount: Math.ceil(total / limit),
    };

    if (isDefaultQuery) {
      await this.cache.set(this.listKey(tenantId), result, TTL);
    }

    return result;
  }

  async findOne(tenantId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId, isActive: true },
      include: { category: { select: { id: true, name: true } } },
    });
    if (!product) throw new NotFoundException('Produit introuvable');
    return product;
  }

  async getLowStockAlerts(tenantId: string) {
    const cached = await this.cache.get<any[]>(this.alertsKey(tenantId));
    if (cached) return cached;

    // Requête raw pour comparer stockQty <= stockAlert
    const products = await this.prisma.$queryRaw<any[]>`
      SELECT id, name, reference, "stockQty", "stockAlert", unit
      FROM products
      WHERE "tenantId" = ${tenantId}
        AND "isActive" = true
        AND "stockQty" <= "stockAlert"
      ORDER BY "stockQty" ASC
    `;

    await this.cache.set(this.alertsKey(tenantId), products, TTL);
    return products;
  }

  async create(tenantId: string, dto: CreateProductDto) {
    if (dto.reference) {
      const exists = await this.prisma.product.findUnique({
        where: { tenantId_reference: { tenantId, reference: dto.reference } },
      });
      if (exists) {
        throw new ConflictException(
          `Référence "${dto.reference}" déjà utilisée`,
        );
      }
    }

    const product = await this.prisma.product.create({
      data: {
        tenantId,
        ...dto,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });

    // Enregistrer le stock initial comme mouvement d'entrée
    if (dto.stockQty && dto.stockQty > 0) {
      await this.prisma.stockMovement.create({
        data: {
          tenantId,
          productId: product.id,
          userId: 'system',
          type: 'IN',
          quantity: dto.stockQty,
          reason: 'Stock initial',
        },
      });
    }

    await this.invalidate(tenantId);
    return product;
  }

  async update(tenantId: string, id: string, userId: string, dto: UpdateProductDto) {
    const existing = await this.findOne(tenantId, id);

    if (dto.reference) {
      const conflict = await this.prisma.product.findFirst({
        where: {
          tenantId,
          reference: dto.reference,
          NOT: { id },
        },
      });
      if (conflict) {
        throw new ConflictException(
          `Référence "${dto.reference}" déjà utilisée`,
        );
      }
    }

    // Détecter une modification manuelle du stock et créer un mouvement tracé
    const stockChanged =
      dto.stockQty !== undefined && dto.stockQty !== existing.stockQty;

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...dto,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });

    if (stockChanged) {
      const diff = dto.stockQty! - existing.stockQty;
      await this.prisma.stockMovement.create({
        data: {
          tenantId,
          productId: id,
          userId,
          type: diff > 0 ? 'IN' : 'OUT',
          quantity: Math.abs(diff),
          reason: 'Correction manuelle (édition produit)',
        },
      });
    }

    await this.invalidate(tenantId);
    return updated;
  }

  async adjustStock(
    tenantId: string,
    id: string,
    userId: string,
    dto: AdjustStockDto,
  ) {
    const product = await this.findOne(tenantId, id);

    let newQty = product.stockQty;
    if (dto.type === 'IN' || dto.type === 'RETURN') {
      newQty += dto.quantity;
    } else if (dto.type === 'OUT' || dto.type === 'ADJUSTMENT') {
      newQty -= dto.quantity;
      if (newQty < 0) {
        throw new BadRequestException(
          `Stock insuffisant (disponible : ${product.stockQty} ${product.unit})`,
        );
      }
    }

    const [updatedProduct] = await this.prisma.$transaction([
      this.prisma.product.update({
        where: { id },
        data: { stockQty: newQty },
      }),
      this.prisma.stockMovement.create({
        data: {
          tenantId,
          productId: id,
          userId,
          type: dto.type,
          quantity: dto.quantity,
          reason: dto.reason,
        },
      }),
    ]);

    await this.invalidate(tenantId);
    return updatedProduct;
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    // Soft delete — on ne supprime pas les produits liés à des ventes
    await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });

    await this.invalidate(tenantId);
  }

  async setupCatalog(tenantId: string, items: import('./dto/setup-catalog.dto').CatalogItemDto[]) {
    if (!items.length) return { categories: 0, products: 0 };

    // 1. Upsert catégories unique par nom
    const categoryNames = [...new Set(items.map((i) => i.categoryName))];
    const categoryMap: Record<string, string> = {};

    for (const name of categoryNames) {
      const cat = await this.prisma.productCategory.upsert({
        where: { tenantId_name: { tenantId, name } },
        create: { tenantId, name },
        update: {},
      });
      categoryMap[name] = cat.id;
    }

    // 2. Récupérer les noms de produits existants pour éviter les doublons
    const existingNames = new Set(
      (await this.prisma.product.findMany({
        where: { tenantId, isActive: true },
        select: { name: true },
      })).map((p) => p.name.toLowerCase()),
    );

    // 3. Filtrer les nouveaux produits
    const toCreate = items
      .filter((i) => !existingNames.has(i.name.toLowerCase()))
      .map((i) => ({
        tenantId,
        categoryId: categoryMap[i.categoryName],
        name: i.name,
        unit: i.unit,
        buyPrice: i.buyPrice,
        sellPrice: i.sellPrice,
        stockQty: i.stockQty ?? 0,
        stockAlert: i.stockAlert ?? 5,
      }));

    let created = 0;
    if (toCreate.length > 0) {
      const result = await this.prisma.product.createMany({ data: toCreate });
      created = result.count;
    }

    await this.invalidate(tenantId);
    await this.cache.del(`commerce:categories:${tenantId}`);

    return {
      categories: categoryNames.length,
      products: created,
      skipped: items.length - created,
    };
  }

  // ── Gestion des unités multiples / Conversion ────────────────────────────────
  async configureConversion(
    tenantId: string,
    productId: string,
    dto: ConfigureConversionDto,
  ) {
    await this.findOne(tenantId, productId);

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: {
        purchaseUnit: dto.purchaseUnit,
        conversionFactor: dto.conversionFactor,
        conversionNote: dto.conversionNote,
      },
    });

    await this.invalidate(tenantId);
    return updated;
  }

  async receiveStock(
    tenantId: string,
    productId: string,
    userId: string,
    dto: ReceiveStockDto,
  ) {
    const product = await this.findOne(tenantId, productId);

    // Vérifier que la conversion est configurée
    if (!product.purchaseUnit || !product.conversionFactor) {
      throw new BadRequestException(
        `Conversion non configurée pour "${product.name}". Configurer d'abord: ${product.unit} et facteur de conversion.`,
      );
    }

    // Vérifier que l'unité reçue correspond à purchaseUnit
    if (
      dto.receivedUnit.toLowerCase() !== product.purchaseUnit.toLowerCase()
    ) {
      throw new BadRequestException(
        `Unité reçue "${dto.receivedUnit}" ≠ unité attendue "${product.purchaseUnit}"`,
      );
    }

    // Conversion automatique
    const convertedQty = dto.receivedQty * product.conversionFactor;
    const newStockQty = product.stockQty + convertedQty;

    // Transaction: mise à jour stock + enregistrement réception + mouvement
    const [updatedProduct, inbound] = await this.prisma.$transaction([
      this.prisma.product.update({
        where: { id: productId },
        data: { stockQty: newStockQty },
      }),
      this.prisma.stockInbound.create({
        data: {
          tenantId,
          productId,
          receivedQty: dto.receivedQty,
          receivedUnit: dto.receivedUnit,
          convertedQty,
          conversionFactor: product.conversionFactor,
          supplierId: dto.supplierId,
          reference: dto.reference,
          notes: dto.notes,
        },
      }),
    ]);

    // Enregistrer le mouvement de stock (séparé pour simplicité)
    await this.prisma.stockMovement.create({
      data: {
        tenantId,
        productId,
        userId,
        type: 'IN',
        quantity: convertedQty,
        reason: `Réception: ${dto.receivedQty} ${dto.receivedUnit} = ${convertedQty} ${product.unit}`,
      },
    });

    await this.invalidate(tenantId);

    return {
      product: updatedProduct,
      inbound,
      message: `Réception enregistrée: ${dto.receivedQty} ${dto.receivedUnit} = ${convertedQty} ${product.unit}`,
    };
  }

  async getStockInbounds(tenantId: string, productId?: string, limit = 50) {
    const where: any = { tenantId };
    if (productId) where.productId = productId;

    return this.prisma.stockInbound.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, unit: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ── Historique mouvements de stock ────────────────────────────────────────
  async getStockMovements(tenantId: string, productId: string, limit = 100) {
    const product = await this.findOne(tenantId, productId);

    const movements = await this.prisma.stockMovement.findMany({
      where: { tenantId, productId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return {
      product: { id: product.id, name: product.name, unit: product.unit, currentStock: product.stockQty },
      movements,
    };
  }
}
