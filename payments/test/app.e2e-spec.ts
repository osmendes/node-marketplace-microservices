import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp } from "./utils/create-test-app";

describe("AppController (e2e)", () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it("/ (GET)", () => {
    return request(app.getHttpServer()).get("/").expect(200).expect("Hello World!");
  });

  it("/health (GET) returns Terminus status with database and rabbitmq", async () => {
    const response = await request(app.getHttpServer()).get("/health").expect(200);

    expect(response.body.status).toBe("ok");
    expect(response.body.details?.database?.status).toBe("up");
    expect(response.body.details?.rabbitmq?.status).toBe("up");
  });

  afterEach(async () => {
    await app.close();
  });
});
