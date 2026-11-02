import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Payment } from "./entities/payment.entity";
import { FakePaymentGatewayService } from "./fake-payment-gateway.service";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [TypeOrmModule.forFeature([Payment])],
  controllers: [PaymentsController],
  providers: [FakePaymentGatewayService, PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
