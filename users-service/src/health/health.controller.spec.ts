import { HealthCheckService, TypeOrmHealthIndicator } from "@nestjs/terminus";
import { Test, type TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  let controller: HealthController;
  const check = vi.fn();
  const pingCheck = vi.fn();

  beforeEach(async () => {
    check.mockReset();
    pingCheck.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: { check },
        },
        {
          provide: TypeOrmHealthIndicator,
          useValue: { pingCheck },
        },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  it("runs TypeORM database ping through Terminus", async () => {
    const terminusResult = {
      status: "ok",
      info: { database: { status: "up" } },
      error: {},
      details: { database: { status: "up" } },
    };
    check.mockImplementation(async (indicators: Array<() => unknown>) => {
      await Promise.all(indicators.map((indicator) => indicator()));
      return terminusResult;
    });
    pingCheck.mockResolvedValue({ database: { status: "up" } });

    await expect(controller.check()).resolves.toEqual(terminusResult);
    expect(pingCheck).toHaveBeenCalledWith("database");
    expect(check).toHaveBeenCalledTimes(1);
  });
});
