import { IsEnum, IsMongoId, Matches } from 'class-validator';
import { BillPaymentStatus } from '@kingbear/shared';

export class UpdatePaymentStatusDto {
  @IsMongoId()
  factoryId: string;

  @Matches(/^\d{4}-\d{2}$/)
  yearMonth: string;

  @IsEnum(BillPaymentStatus)
  status: BillPaymentStatus;
}
