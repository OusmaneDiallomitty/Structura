import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

/**
 * Service d'upload de fichiers vers Cloudinary.
 *
 * Variables d'environnement requises :
 *   CLOUDINARY_CLOUD_NAME  — Cloud name Cloudinary (ex: dxxxxxxxx)
 *   CLOUDINARY_API_KEY     — API Key
 *   CLOUDINARY_API_SECRET  — API Secret
 */
@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly configured: boolean;

  constructor(private config: ConfigService) {
    const cloudName  = config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey     = config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret  = config.get<string>('CLOUDINARY_API_SECRET');
    this.configured  = !!(cloudName && apiKey && apiSecret);

    if (this.configured) {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
      this.logger.log('Cloudinary upload service ready');
    } else {
      this.logger.warn('Cloudinary non configuré — logo uploads disabled (set CLOUDINARY_* env vars)');
    }
  }

  /**
   * Upload un logo dans Cloudinary.
   * Dossier : structura-logos/{tenantId}
   * Retourne l'URL publique sécurisée (HTTPS).
   */
  async uploadLogo(tenantId: string, file: any): Promise<string> {
    if (!this.configured) {
      throw new BadRequestException('Upload désactivé — Cloudinary non configuré sur ce serveur.');
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('Format non supporté. Utilisez JPEG, PNG, WebP ou SVG.');
    }

    if (file.size > 2 * 1024 * 1024) {
      throw new BadRequestException('Logo trop lourd (max 2 Mo).');
    }

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder:          `structura-logos/${tenantId}`,
          resource_type:   'image',
          overwrite:       false,
          transformation:  [{ width: 300, height: 300, crop: 'limit' }],
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Upload échoué'));
          resolve(result);
        },
      ).end(file.buffer);
    });

    this.logger.log(`Logo uploadé : ${result.secure_url}`);
    return result.secure_url;
  }

  /**
   * Supprime un logo depuis son URL Cloudinary.
   * Silencieux si l'URL ne correspond pas à Cloudinary.
   */
  async deleteByUrl(url: string): Promise<void> {
    if (!this.configured || !url) return;
    if (!url.includes('cloudinary.com')) return;

    try {
      // Extraire le public_id depuis l'URL (chemin sans extension)
      const match = url.match(/\/v\d+\/(.+)\.[a-z]+$/i);
      if (!match) return;
      const publicId = match[1];
      await cloudinary.uploader.destroy(publicId);
      this.logger.log(`Logo supprimé : ${publicId}`);
    } catch (e: any) {
      this.logger.warn(`Suppression logo échouée : ${e.message}`);
    }
  }
}
