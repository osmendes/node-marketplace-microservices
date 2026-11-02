import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentsService } from "../../payments/payments.service";
import type { PaymentQueueService } from "../payment-queue/payment-queue.service";
import type { PaymentOrderMessage } from "../payment-queue.interface";
import type { RabbitmqService } from "../rabbitmq/rabbitmq.service";
import { PaymentConsumerService } from "./payment-consumer.service";

describe("PaymentConsumerService", () => {
  let service: PaymentConsumerService;
  let paymentsService: {
    processPayment: ReturnType<typeof vi.fn>;
  };

  const validMessage: PaymentOrderMessage = {
    orderId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    userId: "11111111-1111-4111-8111-111111111111",
    amount: 150.5,
    paymentMethod: "pix",
    items: [{ productId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", quantity: 1, price: 150.5 }],
  };

  beforeEach(() => {
    paymentsService = {
      processPayment: vi.fn().mockResolvedValue({ id: "payment-id" }),
    };

    service = new PaymentConsumerService(
      {} as PaymentQueueService,
      {} as RabbitmqService,
      paymentsService as unknown as PaymentsService,
    );
  });

  async function processPaymentOrder(message: PaymentOrderMessage): Promise<void> {
    const process = (
      service as unknown as { processPaymentOrder: (msg: PaymentOrderMessage) => Promise<void> }
    ).processPaymentOrder.bind(service);
    return process(message);
  }

  it("calls PaymentsService.processPayment for a valid message", async () => {
    await processPaymentOrder(validMessage);

    expect(paymentsService.processPayment).toHaveBeenCalledWith(validMessage);
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
    expect(service.getMetrics().totalFailed).toBe(1);
  });

  it("propagates errors from processPayment for retry/DLQ", async () => {
    paymentsService.processPayment.mockRejectedValue(new Error("gateway failed"));

    await expect(processPaymentOrder(validMessage)).rejects.toThrow("gateway failed");
    expect(service.getMetrics().totalFailed).toBe(1);
  });
});
