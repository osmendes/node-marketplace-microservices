import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentStatus } from "../../payments/enums/payment-status.enum";
import type { PaymentsService } from "../../payments/payments.service";
import type { PaymentQueueService } from "../payment-queue/payment-queue.service";
import type { PaymentOrderMessage } from "../payment-queue.interface";
import type { PaymentResultQueueService } from "../payment-result-queue/payment-result-queue.service";
import type { RabbitmqService } from "../rabbitmq/rabbitmq.service";
import { PaymentConsumerService } from "./payment-consumer.service";

describe("PaymentConsumerService", () => {
  let service: PaymentConsumerService;
  let paymentsService: {
    processPayment: ReturnType<typeof vi.fn>;
  };
  let paymentResultQueueService: {
    publishPaymentResult: ReturnType<typeof vi.fn>;
  };

  const validMessage: PaymentOrderMessage = {
    orderId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    userId: "11111111-1111-4111-8111-111111111111",
    amount: 150.5,
    paymentMethod: "pix",
    items: [{ productId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", quantity: 1, price: 150.5 }],
  };

  const approvedPayment = {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    orderId: validMessage.orderId,
    userId: validMessage.userId,
    amount: "150.50",
    status: PaymentStatus.APPROVED,
    transactionId: "txn_approved",
    rejectionReason: null,
    processedAt: new Date("2026-11-02T16:00:00.000Z"),
  };

  beforeEach(() => {
    paymentsService = {
      processPayment: vi.fn().mockResolvedValue(approvedPayment),
    };
    paymentResultQueueService = {
      publishPaymentResult: vi.fn().mockResolvedValue(undefined),
    };

    service = new PaymentConsumerService(
      {} as PaymentQueueService,
      {} as RabbitmqService,
      paymentsService as unknown as PaymentsService,
      paymentResultQueueService as unknown as PaymentResultQueueService,
    );
  });

  async function processPaymentOrder(message: PaymentOrderMessage): Promise<void> {
    const process = (
      service as unknown as { processPaymentOrder: (msg: PaymentOrderMessage) => Promise<void> }
    ).processPaymentOrder.bind(service);
    return process(message);
  }

  it("calls PaymentsService.processPayment and publishes payment result", async () => {
    await processPaymentOrder(validMessage);

    expect(paymentsService.processPayment).toHaveBeenCalledWith(validMessage);
    expect(paymentResultQueueService.publishPaymentResult).toHaveBeenCalledWith({
      orderId: approvedPayment.orderId,
      paymentId: approvedPayment.id,
      userId: approvedPayment.userId,
      status: "approved",
      amount: 150.5,
      transactionId: "txn_approved",
      rejectionReason: null,
      processedAt: "2026-11-02T16:00:00.000Z",
    });
    expect(service.getMetrics().totalSuccess).toBe(1);
    expect(service.getMetrics().totalFailed).toBe(0);
  });

  it("does not call processPayment when message is invalid", async () => {
    const invalidMessage: PaymentOrderMessage = {
      ...validMessage,
      orderId: "",
    };

    await expect(processPaymentOrder(invalidMessage)).rejects.toThrow("Invalid payment message received");
    expect(paymentsService.processPayment).not.toHaveBeenCalled();
    expect(paymentResultQueueService.publishPaymentResult).not.toHaveBeenCalled();
    expect(service.getMetrics().totalFailed).toBe(1);
  });

  it("propagates errors from processPayment for retry/DLQ", async () => {
    paymentsService.processPayment.mockRejectedValue(new Error("gateway failed"));

    await expect(processPaymentOrder(validMessage)).rejects.toThrow("gateway failed");
    expect(paymentResultQueueService.publishPaymentResult).not.toHaveBeenCalled();
    expect(service.getMetrics().totalFailed).toBe(1);
  });

  it("propagates errors from publishPaymentResult for retry/DLQ", async () => {
    paymentResultQueueService.publishPaymentResult.mockRejectedValue(new Error("publish failed"));

    await expect(processPaymentOrder(validMessage)).rejects.toThrow("publish failed");
    expect(service.getMetrics().totalFailed).toBe(1);
  });
});
