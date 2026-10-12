import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PaymentQueueService } from "../payment-queue/payment-queue.service";
import { PaymentOrderMessage } from "../payment-queue.interface";
import { RabbitmqService } from "../rabbitmq/rabbitmq.service";

export interface ConsumerMetrics {
  totalProcessed: number;
  totalSuccess: number;
  totalFailed: number;
  totalRetries: number;
  lastPrcessedAt: Date | null;
  startedAt: Date;
  averageProcessingTime: number;
}

@Injectable()
export class PaymentConsumerService implements OnModuleInit {
  /*
    ========================================
    MÉTRICAS DE MONITORMENTO
    ========================================
    Armazena estatísticas de processamento em memória
    Em produção usaríamos Prometheus, DataDog, etc.
  */
  private metrics: ConsumerMetrics = {
    totalProcessed: 0,
    totalSuccess: 0,
    totalFailed: 0,
    totalRetries: 0,
    lastPrcessedAt: null,
    startedAt: new Date(),
    averageProcessingTime: 0,
  };

  private totalProcessingTime = 0;

  private readonly logger = new Logger(PaymentConsumerService.name);

  constructor(
    private readonly paymentQueueService: PaymentQueueService,
    private readonly rabbitMQService: RabbitmqService,
  ) {}

  async onModuleInit() {
    this.logger.log("Starting Payment Consumer Service");
    this.metrics.startedAt = new Date();
    await this.startConsuming();
  }

  async startConsuming() {
    try {
      this.logger.log("Starting to consume payment orders from queue");

      const isConnected = await this.rabbitMQService.waitForConnection();

      if (!isConnected) {
        this.logger.error(`Could not connect to RabbitMQ after multiple attempts`);
        return;
      }

      // Registra o callback para processar cada mensagem
      // O bind(this) garante que o 'this' dentro do callback seja esta classe
      await this.paymentQueueService.consumePaymentOrders(this.processPaymentOrder.bind(this));
      this.logger.log("Payment Consumer Service started successfully");
    } catch (error) {
      this.logger.error("Failed to start consuming payment orders:", error);
    }
  }

  private processPaymentOrder(message: PaymentOrderMessage): void {
    const startTime = Date.now();
    try {
      this.logger.log(
        `Processing payment order: orderId=${message.orderId}, userId=${message.userId}, amount=${message.amount}`,
      );

      if (!this.validateMessage(message)) {
        this.logger.error("Invalid payment message received");
        // Rejeitamos a imagem para não ficar processando
        throw new Error("Invalid payment message received");
      }

      this.logger.log("Payment order received and validated");
      this.updateMetrics(true, startTime);
    } catch (error) {
      this.updateMetrics(false, startTime);
      this.logger.error(`Failed to process payment for order ${message.orderId}: `, error);

      // IMPORTANTE: relançamos o erro para o RabbitMQ fazer NACK
      throw error;
    }
  }

  private validateMessage(message: PaymentOrderMessage): boolean {
    if (!message.orderId) {
      this.logger.error("Missing orderId in payment message");
      return false;
    }

    if (!message.userId) {
      this.logger.error("Missing userId in payment message");
      return false;
    }

    if (!message.amount || message.amount <= 0) {
      this.logger.error("Invalid amount in payment message");
      return false;
    }

    if (!message.paymentMethod) {
      this.logger.error("Missing paymentMethod in payment message");
      return false;
    }

    if (!message.items || message.items.length === 0) {
      this.logger.error("No items in payment message");
      return false;
    }

    return true;
  }

  private updateMetrics(success: boolean, startTime: number): void {
    // Calcula tempo de processamento desta mensagem
    const processingTime = Date.now() - startTime;

    // Incrementa contadores
    this.metrics.totalProcessed++;
    this.metrics.lastPrcessedAt = new Date();

    if (success) {
      this.metrics.totalSuccess++;
    } else {
      this.metrics.totalFailed++;
    }

    // Atualiza tempo médio de processamento
    this.totalProcessingTime += processingTime;
    this.metrics.averageProcessingTime = Math.round(this.totalProcessingTime / this.metrics.totalProcessed);

    if (this.metrics.totalProcessed % 10 === 0) {
      this.logMetricsSummary();
    }
  }

  incrementRetryCount(): void {
    this.metrics.totalRetries++;
  }

  private logMetricsSummary(): void {
    const successRate =
      this.metrics.totalProcessed > 0
        ? ((this.metrics.totalSuccess / this.metrics.totalProcessed) * 100).toFixed(2)
        : "0";

    this.logger.log("============ Consumer Metrics ============");
    this.logger.log(`Total Processed: ${this.metrics.totalProcessed}`);
    this.logger.log(`Success: ${this.metrics.totalSuccess}`);
    this.logger.log(`Failed: ${this.metrics.totalFailed}`);
    this.logger.log(`Retries: ${this.metrics.totalRetries}`);
    this.logger.log(`Success Rate: ${successRate}%`);
    this.logger.log(`Avg Processing Time: ${this.metrics.averageProcessingTime}ms`);
    this.logger.log("===========================================");
  }

  getMetrics(): ConsumerMetrics {
    // Retorna cópia para evitar modificação externa
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      totalProcessed: 0,
      totalSuccess: 0,
      totalFailed: 0,
      totalRetries: 0,
      lastPrcessedAt: null,
      startedAt: new Date(),
      averageProcessingTime: 0,
    };
    this.totalProcessingTime = 0;
    this.logger.log("Metrics reset");
  }
}
