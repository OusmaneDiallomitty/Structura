import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

/** Messages d'erreur explicites par ressource + action */
const FORBIDDEN_MESSAGES: Record<string, Record<string, string>> = {
  students: {
    view:   "Vous n'avez pas accès à la liste des élèves.",
    create: "Vous n'avez pas la permission d'ajouter des élèves.",
    edit:   "Vous n'avez pas la permission de modifier les informations d'un élève.",
    delete: "Vous n'avez pas la permission de supprimer un élève.",
  },
  payments: {
    view:      "Vous n'avez pas accès aux paiements.",
    create:    "Vous n'avez pas la permission d'enregistrer des paiements.",
    edit:      "Vous n'avez pas la permission de modifier des paiements.",
    delete:    "Vous n'avez pas la permission de supprimer des paiements.",
    configure: "Vous n'avez pas la permission de configurer les frais de scolarité.",
  },
  classes: {
    view:   "Vous n'avez pas accès aux classes.",
    create: "Vous n'avez pas la permission de créer des classes.",
    edit:   "Vous n'avez pas la permission de modifier des classes.",
    delete: "Vous n'avez pas la permission de supprimer des classes.",
  },
  attendance: {
    view:   "Vous n'avez pas accès aux présences.",
    create: "Vous n'avez pas la permission de gérer les présences.",
    edit:   "Vous n'avez pas la permission de modifier les présences.",
    delete: "Vous n'avez pas la permission de supprimer des enregistrements de présence.",
  },
  grades: {
    view:   "Vous n'avez pas accès aux notes.",
    create: "Vous n'avez pas la permission de saisir des notes.",
    edit:   "Vous n'avez pas la permission de modifier des notes.",
    delete: "Vous n'avez pas la permission de supprimer des notes.",
  },
  team: {
    view:   "Vous n'avez pas accès à la gestion de l'équipe.",
    create: "Vous n'avez pas la permission d'ajouter des membres à l'équipe.",
    edit:   "Vous n'avez pas la permission de modifier des membres de l'équipe.",
    delete: "Vous n'avez pas la permission de retirer des membres de l'équipe.",
  },
  expenses: {
    view:   "Vous n'avez pas accès aux dépenses.",
    create: "Vous n'avez pas la permission d'enregistrer des dépenses.",
    edit:   "Vous n'avez pas la permission de modifier des dépenses.",
    delete: "Vous n'avez pas la permission de supprimer des dépenses.",
  },
  reports: {
    view:   "Vous n'avez pas accès aux rapports.",
    export: "Vous n'avez pas la permission d'exporter des rapports.",
  },
};

/** Permissions par défaut par rôle (miroir du frontend) */
const DEFAULT_ROLE_PERMISSIONS: Record<string, Record<string, Record<string, boolean>>> = {
  DIRECTOR: {
    payments:   { view: true, create: true, edit: true, delete: true },
    expenses:   { view: true, create: true, edit: true, delete: true },
    students:   { view: true, create: true, edit: true, delete: true },
    classes:    { view: true, create: true, edit: true, delete: true },
    attendance: { view: true, create: true, edit: true, delete: true },
    grades:     { view: true, create: true, edit: true, delete: true },
    team:       { view: true, create: true, edit: true, delete: true },
    reports:    { view: true, export: true },
  },
  ACCOUNTANT: {
    payments:   { view: true, create: true, edit: true, delete: false },
    expenses:   { view: true, create: true, edit: true, delete: false },
    students:   { view: true, create: false, edit: false, delete: false },
    classes:    { view: true, create: false, edit: false, delete: false },
    attendance: { view: true, create: false, edit: false, delete: false },
    grades:     { view: false, create: false, edit: false, delete: false },
    team:       { view: false, create: false, edit: false, delete: false },
    reports:    { view: true, export: true },
  },
  TEACHER: {
    payments:   { view: false, create: false, edit: false, delete: false },
    expenses:   { view: false, create: false, edit: false, delete: false },
    students:   { view: true, create: true, edit: true, delete: false },
    classes:    { view: true, create: false, edit: false, delete: false },
    attendance: { view: true, create: true, edit: true, delete: false },
    grades:     { view: true, create: true, edit: true, delete: false },
    team:       { view: false, create: false, edit: false, delete: false },
    reports:    { view: false, export: false },
  },
  SUPERVISOR: {
    payments:   { view: false, create: false, edit: false, delete: false },
    expenses:   { view: false, create: false, edit: false, delete: false },
    students:   { view: true, create: false, edit: false, delete: false },
    classes:    { view: true, create: false, edit: false, delete: false },
    attendance: { view: true, create: true, edit: true, delete: false },
    grades:     { view: true, create: false, edit: false, delete: false },
    team:       { view: false, create: false, edit: false, delete: false },
    reports:    { view: false, export: false },
  },
  SECRETARY: {
    payments:   { view: true, create: true, edit: false, delete: false },
    expenses:   { view: true, create: false, edit: false, delete: false },
    students:   { view: true, create: true, edit: true, delete: false },
    classes:    { view: true, create: false, edit: false, delete: false },
    attendance: { view: true, create: false, edit: false, delete: false },
    grades:     { view: false, create: false, edit: false, delete: false },
    team:       { view: false, create: false, edit: false, delete: false },
    reports:    { view: false, export: false },
  },
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<{ resource: string; action: string }>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!permission) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) return false;

    // Le JWT stocke le rôle en lowercase (role.toLowerCase() dans auth.service)
    const roleUpper = user.role?.toUpperCase();

    // Le directeur (ou co-directeur délégué) a toujours toutes les permissions
    if (roleUpper === 'DIRECTOR' || user.permissions?.isCoDirector === true) return true;

    const { resource, action } = permission;

    // Permissions custom (JSON en BDD) → prioritaires sur les défauts du rôle
    const hasPermission = user.permissions
      ? user.permissions[resource]?.[action] === true
      : DEFAULT_ROLE_PERMISSIONS[roleUpper]?.[resource]?.[action] === true;

    if (!hasPermission) {
      const msg =
        FORBIDDEN_MESSAGES[resource]?.[action] ??
        "Vous n'avez pas la permission d'effectuer cette action.";
      throw new ForbiddenException(msg);
    }

    return true;
  }
}
