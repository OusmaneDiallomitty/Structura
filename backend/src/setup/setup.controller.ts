import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SetupService } from './setup.service';
import { ApplyTemplateDto } from './dto/apply-template.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('setup')
@UseGuards(JwtAuthGuard)
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  /**
   * GET /api/setup/templates
   * Obtenir tous les templates d'école disponibles
   */
  @Get('templates')
  async getTemplates() {
    return this.setupService.getAvailableTemplates();
  }

  /**
   * POST /api/setup/apply-template
   * Appliquer un template d'école (créer les classes automatiquement)
   */
  @Post('apply-template')
  @HttpCode(HttpStatus.CREATED)
  async applyTemplate(
    @Body() dto: ApplyTemplateDto,
    @CurrentUser() user: any,
  ) {
    return this.setupService.applyTemplate(dto.templateType, user.tenantId);
  }

  /**
   * POST /api/setup/complete-onboarding
   * Marquer l'onboarding comme complété
   */
  @Post('complete-onboarding')
  @HttpCode(HttpStatus.OK)
  async completeOnboarding(@CurrentUser() user: any) {
    return this.setupService.completeOnboarding(user.id);
  }

  /**
   * GET /api/setup/onboarding-status
   * Vérifier si l'onboarding est complété
   */
  @Get('onboarding-status')
  async getOnboardingStatus(@CurrentUser() user: any) {
    const completed = await this.setupService.isOnboardingCompleted(user.id);
    return { onboardingCompleted: completed };
  }
}
