import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import type { Payment } from "./entities/payment.entity";
import { PaymentsService } from "./payments.service";

@Controller("payments")
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get(":orderId")
  findByOrderId(@Param("orderId", new ParseUUIDPipe({ version: "4" })) orderId: string): Promise<Payment> {
    return this.paymentsService.findByOrderId(orderId);
  }
}
