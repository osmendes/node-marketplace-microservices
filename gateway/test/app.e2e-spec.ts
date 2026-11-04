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

  afterEach(async () => {
    await app.close();
  });

  it("GET / returns Hello World!", async () => {
    await request(app.getHttpServer()).get("/").expect(200).expect("Hello World!");
  });

  it("GET /health is reachable with Terminus ok (smoke)", async () => {
    const response = await request(app.getHttpServer()).get("/health").expect(200);

    expect(response.body.status).toBe("ok");
  });
});
