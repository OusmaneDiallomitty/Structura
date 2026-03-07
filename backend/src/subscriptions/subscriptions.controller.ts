import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  Query,
  RawBodyRequest,
  Req,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { SubscriptionsService, DjomyWebhookEvent } from './subscriptions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

@Controller('subscriptions')
export class SubscriptionsController {
  private readonly logger = new Logger(SubscriptionsController.name);

  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly config: ConfigService,
  ) {}

  // ─────────────────────────────────────────────
  // GET /api/subscriptions/status
  // Plan courant, usage, features disponibles
  // ─────────────────────────────────────────────

  @Get('status')
  @UseGuards(JwtAuthGuard)
  async getStatus(@Request() req) {
    return this.subscriptionsService.getSubscriptionStatus(req.user.tenantId);
  }

  // ─────────────────────────────────────────────
  // POST /api/subscriptions/checkout
  // Crée un paiement Djomy, retourne l'URL de redirection
  // Réservé aux DIRECTOR uniquement
  // ─────────────────────────────────────────────

  @Post('checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DIRECTOR')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ global: { limit: 5, ttl: 60_000 }, burst: { limit: 5, ttl: 1_000 } }) // 5 tentatives/min
  async createCheckout(
    @Request() req,
    @Body() dto: CreateCheckoutDto,
  ) {
    const result = await this.subscriptionsService.createCheckout(
      req.user.tenantId,
      dto.plan,
      dto.period,
      dto.payerNumber,
    );

    return {
      paymentUrl: result.paymentUrl,
      transactionId: result.transactionId,
      amount: result.amount,
      currency: 'GNF',
    };
  }

  // ─────────────────────────────────────────────
  // GET /api/subscriptions/verify?ref=SUB-...
  // Vérifie si un paiement est confirmé après retour Djomy
  // ─────────────────────────────────────────────

  @Get('verify')
  @UseGuards(JwtAuthGuard)
  async verifyPayment(
    @Request() req,
    @Query('ref') ref: string,
  ) {
    if (!ref) return { success: false, message: 'Référence manquante' };

    const result = await this.subscriptionsService.verifyPaymentByRef(ref, req.user.tenantId);
    return result;
  }

  // ─────────────────────────────────────────────
  // POST /api/subscriptions/webhook
  // Endpoint Djomy — PAS de JWT, sécurisé via HMAC
  // IMPORTANT : rawBody nécessaire pour vérification signature
  // SkipThrottle : les requêtes viennent des serveurs Djomy, pas d'un utilisateur
  // ─────────────────────────────────────────────

  @Post('webhook')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-webhook-signature') signature: string,
    @Body() event: DjomyWebhookEvent,
  ) {
    const rawBody = req.rawBody?.toString('utf-8') ?? JSON.stringify(event);

    this.logger.log(`🔔 Webhook Djomy reçu — eventType: ${event?.eventType} | signature: ${signature?.substring(0, 20)}... | body: ${rawBody?.substring(0, 150)}`);

    await this.subscriptionsService.handleWebhookEvent(event, rawBody, signature);

    // Toujours retourner 200 rapidement — Djomy attend une réponse immédiate
    return { received: true };
  }
}
