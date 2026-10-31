import { Test, type TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PaymentQueueService } from "./events/payment-queue/payment-queue.service";

describe("AppController", () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PaymentQueueService,
          useValue: {
            publishPaymentOrder: vi.fn(),
            publishPaymentOrderSafe: vi.fn(),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe("root", () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe("Hello World!");
    });
  });

  describe("health", () => {
    it("should return checkout-service health payload", () => {
      expect(appController.getHealth()).toEqual({
        status: "ok",
        service: "checkout-service",
      });
    });
  });
});
