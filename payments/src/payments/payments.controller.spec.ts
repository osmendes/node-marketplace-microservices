import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Payment } from "./entities/payment.entity";
import { PaymentStatus } from "./enums/payment-status.enum";
import { PaymentsController } from "./payments.controller";
import type { PaymentsService } from "./payments.service";

describe("PaymentsController", () => {
  let controller: PaymentsController;
  let paymentsService: {
    findByOrderId: ReturnType<typeof vi.fn>;
  };

  const orderId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  const payment = {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    orderId,
    userId: "11111111-1111-4111-8111-111111111111",
    amount: "150.50",
    status: PaymentStatus.APPROVED,
    paymentMethod: "pix",
    transactionId: "txn_approved",
    rejectionReason: null,
    processedAt: new Date("2026-11-02T10:00:00.000Z"),
    createdAt: new Date("2026-11-02T10:00:00.000Z"),
    updatedAt: new Date("2026-11-02T10:00:00.000Z"),
  } as Payment;

  beforeEach(() => {
    paymentsService = {
      findByOrderId: vi.fn(),
    };

    controller = new PaymentsController(paymentsService as unknown as PaymentsService);
  });

  it("returns payment for orderId", async () => {
    paymentsService.findByOrderId.mockResolvedValue(payment);

    const result: Payment = await controller.findByOrderId(orderId);

    expect(paymentsService.findByOrderId).toHaveBeenCalledWith(orderId);
    expect(result).toEqual(payment);
  });

  it("propagates NotFoundException when payment is missing", async () => {
    paymentsService.findByOrderId.mockRejectedValue(new NotFoundException("not found"));

    await expect(controller.findByOrderId(orderId)).rejects.toBeInstanceOf(NotFoundException);
  });
});
