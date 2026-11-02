import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MetricsService } from "../../metrics/metrics.service";
import type { PaymentOrderMessage } from "../payment-queue.interface";
import type { RabbitmqService } from "../rabbitmq/rabbitmq.service";
import { PaymentQueueService } from "./payment-queue.service";

describe("PaymentQueueService", () => {
  let service: PaymentQueueService;
  let rabbitMQService: {
    publishMessage: ReturnType<typeof vi.fn>;
  };
  let metricsService: {
    rabbitmqMessagesPublishedTotal: { inc: ReturnType<typeof vi.fn> };
  };

  const paymentOrder: PaymentOrderMessage = {
    orderId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    userId: "11111111-1111-4111-8111-111111111111",
    amount: 201,
    paymentMethod: "pix",
    items: [{ productId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", quantity: 2, price: 100.5 }],
  };

  beforeEach(() => {
    rabbitMQService = {
      publishMessage: vi.fn().mockResolvedValue(undefined),
    };

    metricsService = {
      rabbitmqMessagesPublishedTotal: { inc: vi.fn() },
    };

    service = new PaymentQueueService(
      rabbitMQService as unknown as RabbitmqService,
      metricsService as unknown as MetricsService,
    );
  });

  it("increments rabbitmq_messages_published_total after successful publish", async () => {
    await service.publishPaymentOrder(paymentOrder);

    expect(rabbitMQService.publishMessage).toHaveBeenCalledWith(
      "payment",
      "payment.order",
      expect.objectContaining({
        orderId: paymentOrder.orderId,
        amount: paymentOrder.amount,
      }),
    );
    expect(metricsService.rabbitmqMessagesPublishedTotal.inc).toHaveBeenCalledWith({
      queue: "payment_queue",
    });
  });

  it("does not increment the counter when publish fails", async () => {
    rabbitMQService.publishMessage.mockRejectedValue(new Error("broker down"));

    await expect(service.publishPaymentOrder(paymentOrder)).rejects.toThrow("broker down");
    expect(metricsService.rabbitmqMessagesPublishedTotal.inc).not.toHaveBeenCalled();
  });
});
