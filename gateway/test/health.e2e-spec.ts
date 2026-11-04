import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp } from "./utils/create-test-app";

describe("Health (e2e)", () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /health returns Terminus ok when downstream pings are mocked up", async () => {
    const response = await request(app.getHttpServer()).get("/health").expect(200);

    expect(response.body.status).toBe("ok");
    expect(response.body.info?.["users-service"]?.status).toBe("up");
    expect(response.body.info?.["products-service"]?.status).toBe("up");
    expect(response.body.info?.["checkout-service"]?.status).toBe("up");
    expect(response.body.info?.["payments-service"]?.status).toBe("up");
    expect(response.body.details?.["users-service"]?.status).toBe("up");
  });

  it("GET /health/ready returns ready when mocked services are healthy", async () => {
    const response = await request(app.getHttpServer()).get("/health/ready").expect(200);

    expect(response.body.status).toBe("ready");
    expect(response.body.timestamp).toEqual(expect.any(String));
  });

  it("GET /health/live returns alive", async () => {
    const response = await request(app.getHttpServer()).get("/health/live").expect(200);

    expect(response.body.status).toBe("alive");
    expect(response.body.timestamp).toEqual(expect.any(String));
    expect(response.body.uptime).toEqual(expect.any(Number));
  });

  it("GET /health/services returns aggregate from mocked HealthCheckService", async () => {
    const response = await request(app.getHttpServer()).get("/health/services").expect(200);

    expect(response.body.overallStatus).toBe("healthy");
    expect(response.body.timestamp).toEqual(expect.any(String));
    expect(response.body.services).toHaveLength(4);
    expect(response.body.summary).toEqual({
      total: 4,
      healthy: 4,
      unhealthy: 0,
      degraded: 0,
    });
    expect(response.body.services.map((s: { name: string }) => s.name).sort()).toEqual([
      "checkout",
      "payments",
      "products",
      "users",
    ]);
  });
});
