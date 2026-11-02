import { Injectable, Logger } from "@nestjs/common";
import { RabbitmqService } from "../rabbitmq/rabbitmq.service";

@Injectable()
export class PaymentResultQueueService {
  private readonly logger = new Logger(PaymentResultQueueService.name);

  private readonly EXCHANGE = "payment.result";
  private readonly ROUTING_KEY = "payment.result";
  private readonly QUEUE_NAME = "order_payment_result_queue";

  constructor(private readonly rabbitMQService: RabbitmqService) {}

  async consumePaymentResults(callback: (message: unknown) => Promise<void>): Promise<void> {
    this.logger.log("Setting up payment result consumer...");

    await this.rabbitMQService.subscribeToQueue(this.QUEUE_NAME, this.EXCHANGE, this.ROUTING_KEY, callback);

    this.logger.log("Payment result consumer is ready");
  }
}
