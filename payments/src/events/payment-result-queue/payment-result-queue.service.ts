import { Injectable, Logger } from "@nestjs/common";
import type { PaymentResultMessage } from "../payment-result.interface";
import { RabbitmqService } from "../rabbitmq/rabbitmq.service";

@Injectable()
export class PaymentResultQueueService {
  private readonly logger = new Logger(PaymentResultQueueService.name);

  private readonly EXCHANGE = "payment.result";
  private readonly ROUTING_KEY = "payment.result";

  constructor(private readonly rabbitMQService: RabbitmqService) {}

  async publishPaymentResult(message: PaymentResultMessage): Promise<void> {
    const channel = this.rabbitMQService.getChannel();

    if (!channel) {
      const error = new Error("RabbitMQ channel not available to publish payment result");
      this.logger.error(error.message);
      throw error;
    }

    try {
      await channel.assertExchange(this.EXCHANGE, "topic", { durable: true });
      const messageBuffer = Buffer.from(JSON.stringify(message));
      const published = channel.publish(this.EXCHANGE, this.ROUTING_KEY, messageBuffer, {
        persistent: true,
        timestamp: Date.now(),
        contentType: "application/json",
      });

      if (!published) {
        throw new Error("Failed to publish payment result to RabbitMQ");
      }

      this.logger.log(
        `Payment result published: orderId=${message.orderId}, paymentId=${message.paymentId}, status=${message.status}`,
      );
    } catch (error) {
      this.logger.error(
        `Error publishing payment result for orderId=${message.orderId}, paymentId=${message.paymentId}:`,
        error,
      );
      throw error;
    }
  }
}
