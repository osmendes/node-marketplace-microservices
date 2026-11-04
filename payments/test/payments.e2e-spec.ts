import type { INestApplication } from "@nestjs/common";
import { getRepositoryToken } from "@nestjs/typeorm";
import request from "supertest";
import type { App } from "supertest/types";
import type { Repository } from "typeorm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Payment } from "../src/payments/entities/payment.entity";
import { PaymentStatus } from "../src/payments/enums/payment-status.enum";
import { PaymentsService } from "../src/payments/payments.service";
import { createTestApp } from "./utils/create-test-app";

describe("Payments HTTP (e2e)", () => {
  let app: INestApplication<App>;
  let paymentsService: PaymentsService;
  let paymentRepository: Repository<Payment>;

  const orderId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const userId = "11111111-1111-4111-8111-111111111111";

  beforeEach(async () => {
    app = await createTestApp({
      fakePaymentGateway: {
        process: vi.fn().mockResolvedValue({
          approved: true,
          transactionId: "txn_1",
          rejectionReason: null,
        }),
      },
    });

    paymentsService = app.get(PaymentsService);
    paymentRepository = app.get(getRepositoryToken(Payment));
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /payments/:orderId returns 200 with payment seeded via processPayment", async () => {
    const payment = await paymentsService.processPayment({
      orderId,
      userId,
      amount: 150.5,
      paymentMethod: "pix",
      items: [{ productId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", quantity: 1, price: 150.5 }],
    });

    const response = await request(app.getHttpServer()).get(`/payments/${orderId}`).expect(200);

    expect(response.body.id).toBe(payment.id);
    expect(response.body.orderId).toBe(orderId);
    expect(response.body.status).toBe(PaymentStatus.APPROVED);
    expect(response.body.transactionId).toBe("txn_1");
    // SQLite remaps decimal→real, so the JSON body may be number or string.
    expect(Number(response.body.amount)).toBe(150.5);
  });

  it("GET /payments/:orderId returns 200 with payment seeded via repository", async () => {
    await paymentRepository.save(
      paymentRepository.create({
        orderId,
        userId,
        amount: "99.90",
        status: PaymentStatus.REJECTED,
        paymentMethod: "credit_card",
        transactionId: "txn_repo",
        rejectionReason: "Cartão recusado pela operadora",
        processedAt: new Date("2026-11-02T10:00:00.000Z"),
      }),
    );

    const response = await request(app.getHttpServer()).get(`/payments/${orderId}`).expect(200);

    expect(response.body.orderId).toBe(orderId);
    expect(response.body.status).toBe(PaymentStatus.REJECTED);
    expect(response.body.transactionId).toBe("txn_repo");
  });

  it("GET /payments/:orderId returns 404 when payment is missing", async () => {
    await request(app.getHttpServer()).get(`/payments/${orderId}`).expect(404);
  });

  it("GET /payments/:orderId returns 400 for invalid UUID", async () => {
    await request(app.getHttpServer()).get("/payments/not-a-uuid").expect(400);
  });
});
