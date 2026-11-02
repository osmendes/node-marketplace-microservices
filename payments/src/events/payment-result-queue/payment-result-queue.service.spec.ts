import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentResultMessage } from "../payment-result.interface";
import type { RabbitmqService } from "../rabbitmq/rabbitmq.service";
import { PaymentResultQueueService } from "./payment-result-queue.service";

describe("PaymentResultQueueService", () => {
  let service: PaymentResultQueueService;
  let channel: {
    assertExchange: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
  };
  let rabbitMQService: {
    getChannel: ReturnType<typeof vi.fn>;
  };

  const message: PaymentResultMessage = {
    orderId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    paymentId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    userId: "11111111-1111-4111-8111-111111111111",
    status: "approved",
    amount: 49.9,
    transactionId: "txn_1",
    rejectionReason: null,
    processedAt: "2026-11-02T16:00:00.000Z",
  };

  beforeEach(() => {
    channel = {
      assertExchange: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockReturnValue(true),
    };
    rabbitMQService = {
      getChannel: vi.fn().mockReturnValue(channel),
    };
    service = new PaymentResultQueueService(rabbitMQService as unknown as RabbitmqService);
  });

  it("publishes payment result to payment.result exchange", async () => {
    await service.publishPaymentResult(message);

    expect(channel.assertExchange).toHaveBeenCalledWith("payment.result", "topic", { durable: true });
    expect(channel.publish).toHaveBeenCalledWith(
      "payment.result",
      "payment.result",
      expect.any(Buffer),
      expect.objectContaining({
        persistent: true,
        contentType: "application/json",
      }),
    );
  });

  it("throws when RabbitMQ channel is unavailable", async () => {
    rabbitMQService.getChannel.mockReturnValue(undefined);

    await expect(service.publishPaymentResult(message)).rejects.toThrow(
      "RabbitMQ channel not available to publish payment result",
    );
  });

  it("throws when publish returns false", async () => {
    channel.publish.mockReturnValue(false);

    await expect(service.publishPaymentResult(message)).rejects.toThrow("Failed to publish payment result to RabbitMQ");
  });
});
