import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
import { AssignClassesDto } from './dto/assign-classes.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PlanFeatureGuard } from '../common/guards/plan-feature.guard';
import { RequireFeature } from '../common/decorators/require-feature.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users/me
   * Retourne le profil de l'utilisateur connecté avec ses affectations de classes.
   * Permet aux pages présences/notes de toujours avoir les données à jour
   * sans nécessiter une reconnexion.
   */
  @SkipThrottle()
  @Get('me')
  getProfile(@Request() req) {
    return this.usersService.getOwnProfile(req.user.id);
  }

  /**
   * PATCH /users/me
   * Met à jour le profil de l'utilisateur connecté (prénom, nom, téléphone).
   * Accessible à tous les rôles authentifiés.
   */
  @Patch('me')
  updateProfile(@Request() req, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateOwnProfile(req.user.id, dto);
  }

  /**
   * GET /users/team
   * Liste tous les membres de l'équipe du tenant connecté.
   * Accessible à tous les rôles authentifiés.
   */
  @SkipThrottle()
  @Get('team')
  getTeam(@Request() req) {
    return this.usersService.getTeamMembers(req.user.tenantId);
  }

  /**
   * POST /users/team
   * Crée un nouveau membre (DIRECTOR uniquement).
   * Envoie un email d'invitation avec le mot de passe temporaire.
   */
  @Post('team')
  @UseGuards(RolesGuard, PlanFeatureGuard)
  @Roles('DIRECTOR')
  @RequireFeature('multiUser')
  createMember(@Request() req, @Body() dto: CreateTeamMemberDto) {
    return this.usersService.createTeamMember(req.user.tenantId, dto);
  }

  /**
   * PATCH /users/team/:id
   * Modifie rôle, statut ou coordonnées (DIRECTOR uniquement).
   */
  @Patch('team/:id')
  @UseGuards(RolesGuard)
  @Roles('DIRECTOR')
  updateMember(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateTeamMemberDto,
  ) {
    return this.usersService.updateTeamMember(
      req.user.tenantId,
      req.user.id,
      id,
      dto,
    );
  }

  /**
   * PATCH /users/team/:id/permissions
   * Modifie les permissions personnalisées d'un membre (DIRECTOR uniquement).
   */
  @Patch('team/:id/permissions')
  @UseGuards(RolesGuard)
  @Roles('DIRECTOR')
  updatePermissions(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdatePermissionsDto,
  ) {
    return this.usersService.updateMemberPermissions(
      req.user.tenantId,
      req.user.id,
      id,
      dto,
    );
  }

  /**
   * PATCH /users/team/:id/classes
   * Assigne des classes à un professeur (DIRECTOR uniquement).
   */
  @Patch('team/:id/classes')
  @UseGuards(RolesGuard)
  @Roles('DIRECTOR')
  assignClasses(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: AssignClassesDto,
  ) {
    return this.usersService.assignTeacherClasses(
      req.user.tenantId,
      req.user.id,
      id,
      dto,
    );
  }

  /**
   * DELETE /users/team/:id
   * Supprime définitivement un membre (DIRECTOR uniquement).
   */
  @Delete('team/:id')
  @UseGuards(RolesGuard)
  @Roles('DIRECTOR')
  @HttpCode(200)
  deleteMember(@Request() req, @Param('id') id: string) {
    return this.usersService.deleteTeamMember(
      req.user.tenantId,
      req.user.id,
      id,
    );
  }
}
