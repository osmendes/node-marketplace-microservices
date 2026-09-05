import { Module } from '@nestjs/common';
import { RabbitmqService } from './rabbitmq/rabbitmq.service';
import { PaymentQueueService } from './payment-queue/payment-queue.service';

@Module({
  providers: [RabbitmqService, PaymentQueueService],
  exports: [RabbitmqService, PaymentQueueService]
})
export class EventsModule {}
