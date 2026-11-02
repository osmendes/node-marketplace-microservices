import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";
import { PaymentMethod } from "../enums/payment-method.enum";

export class CheckoutDto {
  @ApiProperty({
    description: "Payment method for the order",
    enum: PaymentMethod,
    example: PaymentMethod.PIX,
  })
  @IsEnum(PaymentMethod, {
    message: "paymentMethod must be one of: credit_card, debit_card, pix, boleto",
  })
  paymentMethod: PaymentMethod;
}
