import {
  IsString,
  IsNumber,
  IsDateString,
  IsIn,
  IsOptional,
  Min,
  MaxLength,
} from 'class-validator';

export const EXPENSE_CATEGORIES = [
  'PEDAGOGY',       // Livres, fournitures, photocopies
  'INFRASTRUCTURE', // Réparations, mobilier, entretien
  'HR',             // Primes, avances, divers RH
  'ACTIVITIES',     // Sorties, compétitions, cérémonies
  'GENERAL',        // Électricité, eau, loyer, internet
  'SALARY',         // Salaires du personnel — géré via /payroll
  'OTHER',          // Autre
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  PEDAGOGY:       'Pédagogie',
  INFRASTRUCTURE: 'Infrastructure & Maintenance',
  HR:             'Ressources Humaines',
  ACTIVITIES:     'Activités & Sorties',
  GENERAL:        'Charges Générales',
  SALARY:         'Salaires',
  OTHER:          'Autre',
};

export class CreateExpenseDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @IsIn(EXPENSE_CATEGORIES)
  category: string;

  @IsString()
  @MaxLength(255)
  description: string;

  @IsString()
  @IsIn(['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CHECK'])
  @IsOptional()
  method?: string;

  @IsDateString()
  date: string;

  @IsString()
  @IsOptional()
  academicYear?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  reference?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}
