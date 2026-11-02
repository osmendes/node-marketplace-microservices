import { ConfigService } from "@nestjs/config";
import { Transport } from "@nestjs/microservices";
import { HealthCheckService, MicroserviceHealthIndicator, TypeOrmHealthIndicator } from "@nestjs/terminus";
import { Test, type TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  let controller: HealthController;
  const check = vi.fn();
  const pingCheck = vi.fn();
  const microservicePingCheck = vi.fn();
  const get = vi.fn();

  beforeEach(async () => {
    check.mockReset();
    pingCheck.mockReset();
    microservicePingCheck.mockReset();
    get.mockReset();
    get.mockReturnValue("amqp://admin:admin@localhost:5672");

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
        {
          provide: MicroserviceHealthIndicator,
          useValue: { pingCheck: microservicePingCheck },
        },
        {
          provide: ConfigService,
          useValue: { get },
        },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  it("runs TypeORM and RabbitMQ pings through Terminus", async () => {
    const terminusResult = {
      status: "ok",
      info: {
        database: { status: "up" },
        rabbitmq: { status: "up" },
      },
      error: {},
      details: {
        database: { status: "up" },
        rabbitmq: { status: "up" },
      },
    };
    check.mockImplementation(async (indicators: Array<() => unknown>) => {
      await Promise.all(indicators.map((indicator) => indicator()));
      return terminusResult;
    });
    pingCheck.mockResolvedValue({ database: { status: "up" } });
    microservicePingCheck.mockResolvedValue({ rabbitmq: { status: "up" } });

    await expect(controller.check()).resolves.toEqual(terminusResult);
    expect(get).toHaveBeenCalledWith("RABBITMQ_URL", "amqp://admin:admin@localhost:5672");
    expect(pingCheck).toHaveBeenCalledWith("database");
    expect(microservicePingCheck).toHaveBeenCalledWith("rabbitmq", {
      transport: Transport.RMQ,
      options: { urls: ["amqp://admin:admin@localhost:5672"] },
    });
    expect(check).toHaveBeenCalledTimes(1);
  });
});
