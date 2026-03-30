import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';

/** TTL du cache utilisateur JWT — 5 minutes */
const JWT_USER_CACHE_TTL = 5 * 60;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private cache: CacheService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    const cacheKey = `jwt_user:${payload.userId}`;

    // ── 1. Vérifier le cache Redis ────────────────────────────────────────────
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) {
      // Si le sessionId correspond → retourner directement sans requête BDD
      if (cached.currentSessionId && cached.currentSessionId === payload.sessionId) {
        const { currentSessionId: _sid, ...userWithoutSessionId } = cached;
        return userWithoutSessionId;
      }
      // SessionId différent → session révoquée ou nouvelle connexion → aller en BDD
    }

    // ── 2. Cache miss ou sessionId mismatch → requête BDD ────────────────────
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        taughtClasses: { select: { id: true } },
        tenant: {
          select: {
            isActive:   true,
            name:       true,
            logo:       true,
            moduleType: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Compte invalide ou désactivé');
    }

    if (!user.tenant?.isActive) {
      throw new UnauthorizedException('Organisation désactivée');
    }

    if (user.tenantId !== payload.tenantId) {
      throw new UnauthorizedException('Token invalide');
    }

    if (!user.currentSessionId || user.currentSessionId !== payload.sessionId) {
      throw new UnauthorizedException('SESSION_INVALIDATED');
    }

    // ── 3. Mettre en cache (avec currentSessionId pour validation future) ─────
    const userData = {
      id:               user.id,
      email:            user.email,
      firstName:        user.firstName,
      lastName:         user.lastName,
      role:             user.role,
      tenantId:         user.tenantId,
      schoolName:       user.tenant?.name       ?? null,
      schoolLogo:       user.tenant?.logo       ?? null,
      moduleType:       user.tenant?.moduleType ?? 'SCHOOL',
      phone:            user.phone,
      avatar:           user.avatar,
      emailVerified:    user.emailVerified,
      isActive:         user.isActive,
      permissions:      user.permissions,
      assignedClassIds: user.taughtClasses.map((c) => c.id),
      classAssignments: user.classAssignments ?? [],
      createdAt:        user.createdAt,
      updatedAt:        user.updatedAt,
      currentSessionId: user.currentSessionId, // gardé en cache pour validation
    };

    await this.cache.set(cacheKey, userData, JWT_USER_CACHE_TTL);

    const { currentSessionId: _sid, ...userToReturn } = userData;
    return userToReturn;
  }
}
