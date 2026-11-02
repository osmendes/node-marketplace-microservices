import { Module } from "@nestjs/common";
import { PaymentQueueService } from "./payment-queue/payment-queue.service";
import { PaymentResultQueueService } from "./payment-result-queue/payment-result-queue.service";
import { RabbitmqService } from "./rabbitmq/rabbitmq.service";

@Module({
  providers: [RabbitmqService, PaymentQueueService, PaymentResultQueueService],
  exports: [RabbitmqService, PaymentQueueService, PaymentResultQueueService],
})
export class EventsModule {}
