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

  it("GET /health is public and reports SQLite database up", async () => {
    const response = await request(app.getHttpServer()).get("/health").expect(200);

    expect(response.body.status).toBe("ok");
    expect(response.body.info?.database?.status).toBe("up");
    expect(response.body.details?.database?.status).toBe("up");
    expect(response.body.details?.rabbitmq?.status).toBe("up");
  });
});
