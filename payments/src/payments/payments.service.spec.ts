import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentOrderMessage } from "../events/payment-queue.interface";
import type { MetricsService } from "../metrics/metrics.service";
import type { Payment } from "./entities/payment.entity";
import { PaymentStatus } from "./enums/payment-status.enum";
import type { FakePaymentGatewayService } from "./fake-payment-gateway.service";
import { PaymentsService } from "./payments.service";

describe("PaymentsService", () => {
  let service: PaymentsService;
  let paymentRepository: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  let fakePaymentGatewayService: {
    process: ReturnType<typeof vi.fn>;
  };
  let metricsService: {
    paymentsProcessedTotal: { inc: ReturnType<typeof vi.fn> };
    paymentsApprovedTotal: { inc: ReturnType<typeof vi.fn> };
    paymentsRejectedTotal: { inc: ReturnType<typeof vi.fn> };
  };

  const orderId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const userId = "11111111-1111-4111-8111-111111111111";
  const paymentId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

  const message: PaymentOrderMessage = {
    orderId,
    userId,
    amount: 150.5,
    paymentMethod: "pix",
    items: [{ productId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", quantity: 1, price: 150.5 }],
  };

  const pendingPayment = {
    id: paymentId,
    orderId,
    userId,
    amount: "150.50",
    paymentMethod: "pix",
    status: PaymentStatus.PENDING,
    transactionId: null,
    rejectionReason: null,
    processedAt: null,
    createdAt: new Date("2026-11-02T10:00:00.000Z"),
    updatedAt: new Date("2026-11-02T10:00:00.000Z"),
  } as Payment;

  beforeEach(() => {
    paymentRepository = {
      create: vi.fn((value: Partial<Payment>) => ({ ...value })),
      save: vi.fn(async (value: Payment) => ({ ...pendingPayment, ...value, id: paymentId })),
      findOne: vi.fn(),
    };

    fakePaymentGatewayService = {
      process: vi.fn(),
    };

    metricsService = {
      paymentsProcessedTotal: { inc: vi.fn() },
      paymentsApprovedTotal: { inc: vi.fn() },
      paymentsRejectedTotal: { inc: vi.fn() },
    };

    service = new PaymentsService(
      paymentRepository as never,
      fakePaymentGatewayService as unknown as FakePaymentGatewayService,
      metricsService as unknown as MetricsService,
    );
  });

  describe("processPayment", () => {
    it("creates pending payment, calls gateway and persists approved result", async () => {
      fakePaymentGatewayService.process.mockResolvedValue({
        approved: true,
        transactionId: "txn_approved",
      });

      const result: Payment = await service.processPayment(message);

      expect(paymentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId,
          userId,
          amount: "150.50",
          paymentMethod: "pix",
          status: PaymentStatus.PENDING,
        }),
      );
      expect(fakePaymentGatewayService.process).toHaveBeenCalledWith(150.5);
      expect(result.status).toBe(PaymentStatus.APPROVED);
      expect(result.transactionId).toBe("txn_approved");
      expect(result.rejectionReason).toBeNull();
      expect(result.processedAt).toBeInstanceOf(Date);
      expect(paymentRepository.save).toHaveBeenCalledTimes(2);
      expect(metricsService.paymentsProcessedTotal.inc).toHaveBeenCalledTimes(1);
      expect(metricsService.paymentsApprovedTotal.inc).toHaveBeenCalledTimes(1);
      expect(metricsService.paymentsRejectedTotal.inc).not.toHaveBeenCalled();
    });

    it("persists rejected result with rejectionReason", async () => {
      fakePaymentGatewayService.process.mockResolvedValue({
        approved: false,
        transactionId: "txn_rejected",
        rejectionReason: "Limite excedido",
      });

      const result: Payment = await service.processPayment({ ...message, amount: 10000.01 });

      expect(result.status).toBe(PaymentStatus.REJECTED);
      expect(result.transactionId).toBe("txn_rejected");
      expect(result.rejectionReason).toBe("Limite excedido");
      expect(result.processedAt).toBeInstanceOf(Date);
      expect(metricsService.paymentsProcessedTotal.inc).toHaveBeenCalledTimes(1);
      expect(metricsService.paymentsApprovedTotal.inc).not.toHaveBeenCalled();
      expect(metricsService.paymentsRejectedTotal.inc).toHaveBeenCalledWith({ reason: "Limite excedido" });
    });
  });

  describe("findByOrderId", () => {
    it("returns the most recent payment for orderId", async () => {
      paymentRepository.findOne.mockResolvedValue(pendingPayment);

      const result: Payment = await service.findByOrderId(orderId);

      expect(paymentRepository.findOne).toHaveBeenCalledWith({
        where: { orderId },
        order: { createdAt: "DESC" },
      });
      expect(result).toEqual(pendingPayment);
    });

    it("throws NotFoundException when payment does not exist", async () => {
      paymentRepository.findOne.mockResolvedValue(null);

      await expect(service.findByOrderId(orderId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
