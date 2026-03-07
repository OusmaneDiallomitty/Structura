import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Guard réservant l'accès aux Super Admins de la plateforme.
 * Doit être utilisé APRÈS JwtAuthGuard (qui peuple req.user).
 *
 * Usage :
 *   @UseGuards(JwtAuthGuard, SuperAdminGuard)
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();

    if (!user || user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Accès réservé aux administrateurs de la plateforme');
    }

    return true;
  }
}
