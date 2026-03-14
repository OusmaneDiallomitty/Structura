import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

const ROLE_LABELS: Record<string, string> = {
  DIRECTOR:   'Directeur',
  SECRETARY:  'Secrétaire',
  ACCOUNTANT: 'Comptable',
  TEACHER:    'Professeur',
  SUPERVISOR: 'Surveillant',
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    // Le JWT stocke le rôle en lowercase — normaliser avant comparaison
    const roleUpper = user.role?.toUpperCase();
    const hasRole = requiredRoles.some((role) => roleUpper === role);

    if (!hasRole) {
      const roleLabel = ROLE_LABELS[roleUpper] ?? user.role;
      const allowedLabels = requiredRoles
        .map((r) => ROLE_LABELS[r] ?? r)
        .join(', ');
      throw new ForbiddenException(
        `Action non autorisée pour votre rôle (${roleLabel}). Cette action est réservée aux : ${allowedLabels}.`,
      );
    }

    return true;
  }
}
