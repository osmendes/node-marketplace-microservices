import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { PaymentResultMessage } from "../events/payment-result.interface";
import { PaymentResultQueueService } from "../events/payment-result-queue/payment-result-queue.service";
import { RabbitmqService } from "../events/rabbitmq/rabbitmq.service";
import { OrdersService } from "./orders.service";

@Injectable()
export class PaymentResultConsumerService implements OnModuleInit {
  private readonly logger = new Logger(PaymentResultConsumerService.name);

  constructor(
    private readonly paymentResultQueueService: PaymentResultQueueService,
    private readonly rabbitMQService: RabbitmqService,
    private readonly ordersService: OrdersService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log("Starting Payment Result Consumer Service");
    await this.startConsuming();
  }

  private async startConsuming(): Promise<void> {
    try {
      const isConnected = await this.rabbitMQService.waitForConnection();

      if (!isConnected) {
        this.logger.error("Could not connect to RabbitMQ after multiple attempts");
        return;
      }

      await this.paymentResultQueueService.consumePaymentResults(this.processPaymentResult.bind(this));
      this.logger.log("Payment Result Consumer Service started successfully");
    } catch (error) {
      this.logger.error("Failed to start consuming payment results:", error);
    }
  }

  private async processPaymentResult(rawMessage: unknown): Promise<void> {
    const message = rawMessage as PaymentResultMessage;

    this.logger.log(
      `Processing payment result: orderId=${message?.orderId}, paymentId=${message?.paymentId}, status=${message?.status}`,
    );

    await this.ordersService.applyPaymentResult(message);
  }
}
