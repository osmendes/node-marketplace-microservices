import { HttpHealthIndicator, HealthCheckService as TerminusHealthCheckService } from "@nestjs/terminus";
import { Test, type TestingModule } from "@nestjs/testing";
import { HealthCheckService } from "src/common/health/health-check.service";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

describe("HealthController", () => {
  let controller: HealthController;
  const terminusCheck = vi.fn();
  const pingCheck = vi.fn();

  beforeEach(async () => {
    terminusCheck.mockReset();
    pingCheck.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: {
            getReadyStatus: vi.fn(),
            getLiveStatus: vi.fn(),
          },
        },
        {
          provide: HealthCheckService,
          useValue: {
            checkAllServices: vi.fn(),
            getCachedHealth: vi.fn(),
          },
        },
        {
          provide: TerminusHealthCheckService,
          useValue: { check: terminusCheck },
        },
        {
          provide: HttpHealthIndicator,
          useValue: { pingCheck },
        },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  it("pings the four downstream /health endpoints via HttpHealthIndicator", async () => {
    const terminusResult = {
      status: "ok",
      info: {
        "users-service": { status: "up" },
        "products-service": { status: "up" },
        "checkout-service": { status: "up" },
        "payments-service": { status: "up" },
      },
      error: {},
      details: {
        "users-service": { status: "up" },
        "products-service": { status: "up" },
        "checkout-service": { status: "up" },
        "payments-service": { status: "up" },
      },
    };

    terminusCheck.mockImplementation(async (indicators: Array<() => unknown>) => {
      await Promise.all(indicators.map((indicator) => indicator()));
      return terminusResult;
    });
    pingCheck.mockResolvedValue({ status: "up" });

    await expect(controller.check()).resolves.toEqual(terminusResult);

    expect(pingCheck).toHaveBeenCalledWith("users-service", "http://localhost:3000/health", {
      timeout: 3000,
    });
    expect(pingCheck).toHaveBeenCalledWith("products-service", "http://localhost:3001/health", {
      timeout: 3000,
    });
    expect(pingCheck).toHaveBeenCalledWith("checkout-service", "http://localhost:3003/health", {
      timeout: 3000,
    });
    expect(pingCheck).toHaveBeenCalledWith("payments-service", "http://localhost:3004/health", {
      timeout: 3000,
    });
    expect(pingCheck).toHaveBeenCalledTimes(4);
  });
});
