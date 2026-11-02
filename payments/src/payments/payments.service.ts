import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { PaymentOrderMessage } from "../events/payment-queue.interface";
import { MetricsService } from "../metrics/metrics.service";
import { Payment } from "./entities/payment.entity";
import { PaymentStatus } from "./enums/payment-status.enum";
import { FakePaymentGatewayService } from "./fake-payment-gateway.service";

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    private readonly fakePaymentGatewayService: FakePaymentGatewayService,
    private readonly metricsService: MetricsService,
  ) {}

  async processPayment(message: PaymentOrderMessage): Promise<Payment> {
    const pendingPayment: Payment = this.paymentRepository.create({
      orderId: message.orderId,
      userId: message.userId,
      amount: message.amount.toFixed(2),
      paymentMethod: message.paymentMethod,
      status: PaymentStatus.PENDING,
      transactionId: null,
      rejectionReason: null,
      processedAt: null,
    });

    const savedPending: Payment = await this.paymentRepository.save(pendingPayment);
    this.logger.log(`Payment created as pending: id=${savedPending.id}, orderId=${savedPending.orderId}`);

    const gatewayResult = await this.fakePaymentGatewayService.process(message.amount);

    savedPending.status = gatewayResult.approved ? PaymentStatus.APPROVED : PaymentStatus.REJECTED;
    savedPending.transactionId = gatewayResult.transactionId;
    savedPending.rejectionReason = gatewayResult.rejectionReason ?? null;
    savedPending.processedAt = new Date();

    const processedPayment: Payment = await this.paymentRepository.save(savedPending);
    this.logger.log(
      `Payment processed: id=${processedPayment.id}, orderId=${processedPayment.orderId}, status=${processedPayment.status}`,
    );

    this.metricsService.paymentsProcessedTotal.inc();
    if (gatewayResult.approved) {
      this.metricsService.paymentsApprovedTotal.inc();
    } else {
      this.metricsService.paymentsRejectedTotal.inc({
        reason: gatewayResult.rejectionReason?.trim() || "unknown",
      });
    }

    return processedPayment;
  }

  async findByOrderId(orderId: string): Promise<Payment> {
    const payment: Payment | null = await this.paymentRepository.findOne({
      where: { orderId },
      order: { createdAt: "DESC" },
    });

    if (!payment) {
      throw new NotFoundException(`Payment for orderId ${orderId} not found`);
    }

    return payment;
  }
}
