import type { INestApplication } from "@nestjs/common";
import { HttpHealthIndicator } from "@nestjs/terminus";
import { Test, type TestingModule } from "@nestjs/testing";
import type { App } from "supertest/types";
import { vi } from "vitest";
import { AppModule } from "../../src/app.module";
import { HealthStatus, type ServiceHealth } from "../../src/common/health/health-check.interface";
import { HealthCheckService } from "../../src/common/health/health-check.service";

export type CreateTestAppOptions = {
  servicesHealth?: ServiceHealth[];
};

const defaultServicesHealth = (): ServiceHealth[] => {
  const lastCheck = new Date();
  return [
    {
      name: "users",
      url: "http://localhost:3000",
      status: HealthStatus.HEALTHY,
      responseTime: 1,
      lastCheck,
    },
    {
      name: "products",
      url: "http://localhost:3001",
      status: HealthStatus.HEALTHY,
      responseTime: 1,
      lastCheck,
    },
    {
      name: "checkout",
      url: "http://localhost:3003",
      status: HealthStatus.HEALTHY,
      responseTime: 1,
      lastCheck,
    },
    {
      name: "payments",
      url: "http://localhost:3004",
      status: HealthStatus.HEALTHY,
      responseTime: 1,
      lastCheck,
    },
  ];
};

/**
 * Builds a Nest app for gateway e2e tests with downstream HTTP mocked.
 * Imports AppModule (no DB) and overrides health indicators/services.
 */
export async function createTestApp(options: CreateTestAppOptions = {}): Promise<INestApplication<App>> {
  process.env.JWT_SECRET ??= "test-jwt-secret-change-me";
  process.env.NODE_ENV = "test";
  process.env.RATE_LIMIT_SHORT ??= "10000";
  process.env.RATE_LIMIT_MEDIUM ??= "10000";
  process.env.RATE_LIMIT_LONG ??= "10000";

  const servicesHealth = options.servicesHealth ?? defaultServicesHealth();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(HttpHealthIndicator)
    .useValue({
      pingCheck: vi.fn().mockImplementation(async (key: string) => ({ [key]: { status: "up" } })),
    })
    .overrideProvider(HealthCheckService)
    .useValue({
      checkAllServices: vi.fn().mockResolvedValue(servicesHealth),
      getCachedHealth: vi
        .fn()
        .mockImplementation((serviceName: string) => servicesHealth.find((service) => service.name === serviceName)),
      getAllCachedHealth: vi.fn().mockReturnValue(servicesHealth),
      checkServiceHealth: vi.fn(),
    })
    .compile();

  const app = moduleFixture.createNestApplication();
  await app.init();
  return app;
}
