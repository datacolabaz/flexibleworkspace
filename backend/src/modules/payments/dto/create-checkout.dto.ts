import { IsIn, IsUUID } from 'class-validator';
import { PaymentAdapterName } from '../../../common/constants/payment.enum';

/** 29_API_OPENAPI.yaml POST /payments only ever offers EPOINT/PAYRIFF as a caller-selectable value — STRIPE exists in the payment_adapter DB enum for a future EU-entity adapter (§13.4) but is never publicly selectable. */
export class CreateCheckoutDto {
  @IsUUID()
  bookingId: string;

  @IsIn([PaymentAdapterName.EPOINT, PaymentAdapterName.PAYRIFF])
  provider: PaymentAdapterName;
}
