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
    // Comparaison stricte — .includes() était dangereux ("TEACHER".includes("EACHER") === true)
    const hasRole = requiredRoles.some((role) => user.role === role);

    if (!hasRole) {
      const roleLabel = ROLE_LABELS[user.role] ?? user.role;
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
