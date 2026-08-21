import { IsMongoId, Matches } from 'class-validator';

export class BillingQueryDto {
  @IsMongoId()
  factoryId: string;

  /** "2026-08" */
  @Matches(/^\d{4}-\d{2}$/)
  yearMonth: string;
}
