import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    // Charger l'utilisateur et son tenant depuis la BDD (fraîcheur garantie)
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        taughtClasses: { select: { id: true } },
        tenant: {
          select: {
            isActive: true,
            name:     true,
            logo:     true,
          },
        },
      },
    });

    // Compte inexistant ou désactivé
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Compte invalide ou désactivé');
    }

    // Organisation désactivée (ex : abonnement expiré)
    if (!user.tenant?.isActive) {
      throw new UnauthorizedException('Organisation désactivée');
    }

    // Garantie d'intégrité : le tenantId du token doit correspondre à celui en BDD
    // Protège contre un token émis avec un mauvais tenantId
    if (user.tenantId !== payload.tenantId) {
      throw new UnauthorizedException('Token invalide');
    }

    // Retourne les valeurs de la BDD (jamais celles du payload JWT).
    // IMPORTANT : role reste en MAJUSCULES pour la compatibilité des guards backend.
    // La transformation lowercase se fait dans le controller /auth/me pour le frontend.
    return {
      id:               user.id,
      email:            user.email,
      firstName:        user.firstName,
      lastName:         user.lastName,
      role:             user.role,           // MAJUSCULES — requis par SuperAdminGuard / RolesGuard
      tenantId:         user.tenantId,
      schoolName:       user.tenant?.name  ?? null,
      schoolLogo:       user.tenant?.logo  ?? null,
      phone:            user.phone,
      avatar:           user.avatar,
      emailVerified:    user.emailVerified,
      isActive:         user.isActive,
      permissions:      user.permissions,
      assignedClassIds: user.taughtClasses.map((c) => c.id),
      createdAt:        user.createdAt,
      updatedAt:        user.updatedAt,
    };
  }
}
