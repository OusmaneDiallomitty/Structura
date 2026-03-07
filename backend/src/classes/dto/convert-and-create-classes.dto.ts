import { IsString, IsArray, IsNotEmpty } from 'class-validator';

/**
 * DTO pour la conversion automatique de classes
 * Utilisé quand une classe existe sans section et qu'on veut créer plusieurs sections
 *
 * Exemple :
 * - CP1 existe (25 élèves) → Renommer en CP1 A
 * - Créer CP1 B (nouvelle)
 */
export class ConvertAndCreateClassesDto {
  @IsString()
  @IsNotEmpty()
  academicYearId: string;

  @IsString()
  @IsNotEmpty()
  existingClassId: string; // ID de la classe à convertir (ex: CP1 sans section)

  @IsString()
  @IsNotEmpty()
  className: string; // Nom de base (ex: "CP1")

  @IsArray()
  @IsNotEmpty()
  sectionsToCreate: string[]; // Sections à créer (ex: ["A", "B", "C"])
}
