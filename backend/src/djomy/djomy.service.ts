import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../cache/cache.service';
import * as crypto from 'crypto';

export interface DjomyPaymentResponse {
  transactionId: string;
  status: string;
  redirectUrl: string;
  merchantPaymentReference: string;
  allowedPaymentMethods?: string[];
}

export interface DjomyPaymentStatus {
  transactionId: string;
  status: 'CREATED' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'REDIRECTED' | 'TIMEOUT' | 'REFUNDED';
  paidAmount: number;
  paymentMethod: string;
  receivedAmount: number;
  fees: number;
  payerIdentifier: string;
  merchantPaymentReference: string;
  currency: string;
  createdAt: string;
}

@Injectable()
export class DjomyService {
  private readonly logger = new Logger(DjomyService.name);

  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly TOKEN_CACHE_KEY = 'djomy:access_token';
  private readonly TOKEN_TTL_SECONDS = 3_500; // token expire à 3600s, on cache 3500s

  constructor(
    private readonly config: ConfigService,
    private readonly cache: CacheService,
  ) {
    this.baseUrl      = this.config.getOrThrow<string>('DJOMY_BASE_URL');
    this.clientId     = this.config.getOrThrow<string>('DJOMY_CLIENT_ID');
    this.clientSecret = this.config.getOrThrow<string>('DJOMY_CLIENT_SECRET');
  }

  // ─────────────────────────────────────────────
  // HMAC-SHA256
  // ─────────────────────────────────────────────

  /**
   * Génère une signature HMAC-SHA256 en hexadécimal.
   * Utilisée pour X-API-KEY et pour la vérification des webhooks.
   */
  private generateHmac(data: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Construit la valeur de l'en-tête X-API-KEY.
   * Format : clientId:HMAC_SHA256(clientId, clientSecret)
   */
  private getApiKeyHeader(): string {
    const signature = this.generateHmac(this.clientId, this.clientSecret);
    return `${this.clientId}:${signature}`;
  }

  // ─────────────────────────────────────────────
  // AUTHENTIFICATION
  // ─────────────────────────────────────────────

  /**
   * Obtient le Bearer token Djomy avec mise en cache Redis (1h).
   * Fail-safe : si Redis est down, re-demande le token à chaque appel.
   */
  async getAccessToken(): Promise<string> {
    // 1. Vérifier le cache Redis
    const cached = await this.cache.get<string>(this.TOKEN_CACHE_KEY);
    if (cached) return cached;

    // 2. Demander un nouveau token
    const response = await fetch(`${this.baseUrl}/v1/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.getApiKeyHeader(),
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      this.logger.error(`Djomy auth échoué (${response.status}): ${JSON.stringify(errorBody)}`);
      throw new Error(`Djomy authentication failed: ${response.status}`);
    }

    const body = await response.json();
    const token: string | undefined = body?.data?.accessToken;

    if (!token) {
      this.logger.error('Djomy auth: accessToken absent dans la réponse');
      throw new Error('Djomy: no access token in response');
    }

    // 3. Mettre en cache avec TTL légèrement inférieur à l'expiration
    await this.cache.set(this.TOKEN_CACHE_KEY, token, this.TOKEN_TTL_SECONDS);

    this.logger.debug('Djomy: nouveau token obtenu et mis en cache');
    return token;
  }

  // ─────────────────────────────────────────────
  // PAIEMENT AVEC REDIRECTION (GATEWAY)
  // ─────────────────────────────────────────────

  /**
   * Initie un paiement avec redirection vers le portail Djomy.
   * Supporte tous les moyens de paiement (OM, MTN MoMo, VISA, etc.)
   * Retourne l'URL de redirection vers la page de paiement Djomy.
   */
  async createGatewayPayment(dto: {
    amount: number;
    countryCode: string;
    payerNumber: string;
    description: string;
    merchantPaymentReference: string;
    returnUrl: string;
    cancelUrl: string;
    /** URL HTTPS publique du backend pour recevoir le webhook de confirmation */
    callbackUrl?: string;
    metadata?: Record<string, string | number | boolean>;
    allowedPaymentMethods?: string[];
  }): Promise<DjomyPaymentResponse> {
    const token = await this.getAccessToken();

    const payload = {
      amount: dto.amount,
      countryCode: dto.countryCode,
      payerNumber: dto.payerNumber,
      description: dto.description,
      merchantPaymentReference: dto.merchantPaymentReference,
      returnUrl: dto.returnUrl,
      cancelUrl: dto.cancelUrl,
      ...(dto.callbackUrl ? { callbackUrl: dto.callbackUrl } : {}),
      allowedPaymentMethods: dto.allowedPaymentMethods ?? ['OM', 'MOMO'],
      ...(dto.metadata ? { metadata: dto.metadata } : {}),
    };

    const response = await fetch(`${this.baseUrl}/v1/payments/gateway`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-API-KEY': this.getApiKeyHeader(),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      this.logger.error(`Djomy payment/gateway échoué (${response.status}): ${JSON.stringify(errorBody)}`);
      // Si 401, invalider le token en cache
      if (response.status === 401) {
        await this.cache.del(this.TOKEN_CACHE_KEY);
      }
      throw new Error(`Payment creation failed: ${response.status} — ${JSON.stringify(errorBody)}`);
    }

    const body = await response.json();
    const data = body?.data;

    if (!data?.transactionId || !data?.redirectUrl) {
      this.logger.error(`Djomy: réponse inattendue: ${JSON.stringify(body)}`);
      throw new Error('Djomy: invalid payment response (missing transactionId or redirectUrl)');
    }

    this.logger.log(`Djomy payment créé — ref: ${dto.merchantPaymentReference}, txId: ${data.transactionId}`);

    return {
      transactionId: data.transactionId,
      status: data.status,
      redirectUrl: data.redirectUrl,
      merchantPaymentReference: dto.merchantPaymentReference,
      allowedPaymentMethods: data.allowedPaymentMethods,
    };
  }

  // ─────────────────────────────────────────────
  // STATUT D'UN PAIEMENT
  // ─────────────────────────────────────────────

  /**
   * Récupère le statut actuel d'un paiement Djomy.
   * Utilisé pour confirmer le statut en cas de doute sur un webhook.
   */
  async getPaymentStatus(transactionId: string): Promise<DjomyPaymentStatus> {
    const token = await this.getAccessToken();

    const response = await fetch(
      `${this.baseUrl}/v1/payments/${encodeURIComponent(transactionId)}/status`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-KEY': this.getApiKeyHeader(),
        },
      },
    );

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      this.logger.error(`Djomy getPaymentStatus échoué (${response.status}): ${JSON.stringify(errorBody)}`);
      if (response.status === 401) await this.cache.del(this.TOKEN_CACHE_KEY);
      throw new Error(`Payment status check failed: ${response.status}`);
    }

    const body = await response.json();
    return body?.data as DjomyPaymentStatus;
  }

  // ─────────────────────────────────────────────
  // VÉRIFICATION WEBHOOK
  // ─────────────────────────────────────────────

  /**
   * Vérifie la signature HMAC d'un webhook Djomy.
   *
   * Header reçu : X-Webhook-Signature: v1:<HMAC_SHA256(rawBody, clientSecret)>
   *
   * Retourne true si la signature est valide.
   * Utilise crypto.timingSafeEqual pour éviter les timing attacks.
   */
  verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
    if (!signatureHeader?.startsWith('v1:')) {
      this.logger.warn('Webhook: signature manquante ou format invalide');
      return false;
    }

    const receivedSig = signatureHeader.substring(3); // Enlever "v1:"
    const expectedSig = this.generateHmac(rawBody, this.clientSecret);

    try {
      // Les deux buffers doivent avoir la même longueur pour timingSafeEqual
      const receivedBuf = Buffer.from(receivedSig, 'hex');
      const expectedBuf = Buffer.from(expectedSig, 'hex');

      if (receivedBuf.length !== expectedBuf.length) return false;

      return crypto.timingSafeEqual(receivedBuf, expectedBuf);
    } catch {
      return false;
    }
  }
}
