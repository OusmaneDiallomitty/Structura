import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Intercepteur pour injecter automatiquement le tenantId dans les requêtes
 * Garantit l'isolation multi-tenant
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    
    // Injecter le tenantId de l'utilisateur dans la requête
    if (request.user && request.user.tenantId) {
      request.tenantId = request.user.tenantId;
    }

    return next.handle();
  }
}
