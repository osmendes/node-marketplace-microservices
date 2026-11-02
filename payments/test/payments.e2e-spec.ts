import { type INestApplication, NotFoundException, ValidationPipe } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppController } from "../src/app.controller";
import { AppService } from "../src/app.service";
import { PaymentStatus } from "../src/payments/enums/payment-status.enum";
import { PaymentsController } from "../src/payments/payments.controller";
import { PaymentsService } from "../src/payments/payments.service";

describe("Payments HTTP (e2e)", () => {
  let app: INestApplication<App>;
  let findByOrderId: ReturnType<typeof vi.fn>;

  const orderId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  beforeEach(async () => {
    findByOrderId = vi.fn();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController, PaymentsController],
      providers: [
        AppService,
        {
          provide: PaymentsService,
          useValue: {
            findByOrderId,
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /payments/:orderId returns 200 with payment", async () => {
    findByOrderId.mockResolvedValue({
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      orderId,
      userId: "11111111-1111-4111-8111-111111111111",
      amount: "150.50",
      status: PaymentStatus.APPROVED,
      paymentMethod: "pix",
      transactionId: "txn_approved",
      rejectionReason: null,
      processedAt: "2026-11-02T10:00:00.000Z",
      createdAt: "2026-11-02T10:00:00.000Z",
      updatedAt: "2026-11-02T10:00:00.000Z",
    });

    const response = await request(app.getHttpServer()).get(`/payments/${orderId}`).expect(200);

    expect(findByOrderId).toHaveBeenCalledWith(orderId);
    expect(response.body.status).toBe(PaymentStatus.APPROVED);
    expect(response.body.orderId).toBe(orderId);
  });

  it("GET /payments/:orderId returns 404 when payment is missing", async () => {
    findByOrderId.mockRejectedValue(new NotFoundException(`Payment for orderId ${orderId} not found`));

    await request(app.getHttpServer()).get(`/payments/${orderId}`).expect(404);
  });

  it("GET /payments/:orderId returns 400 for invalid UUID", async () => {
    await request(app.getHttpServer()).get("/payments/not-a-uuid").expect(400);
    expect(findByOrderId).not.toHaveBeenCalled();
  });

  it("GET /health returns 200 with payments-service status", async () => {
    const response = await request(app.getHttpServer()).get("/health").expect(200);

    expect(response.body).toEqual({
      status: "ok",
      service: "payments-service",
    });
  });
});
