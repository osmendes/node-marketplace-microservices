import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

const DEFAULT_NODE_METRICS_PATTERN = /process_cpu|nodejs_heap|nodejs_eventloop/i;
const ROOT_REQUESTS_TOTAL_PATTERN = /http_requests_total\{method="GET",route="\/",status_code="200"\} (\d+)/;

describe("MetricsController (e2e)", () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /metrics is public and returns Prometheus text", async () => {
    const response = await request(app.getHttpServer()).get("/metrics").expect(200);

    expect(response.text).toContain("http_requests_total");
    expect(response.text).toContain("http_request_duration_seconds");
    expect(response.text).toMatch(DEFAULT_NODE_METRICS_PATTERN);
    expect(String(response.headers["content-type"])).toContain("text/plain");
  });

  it("instruments other routes and does not count /metrics scrapes", async () => {
    await request(app.getHttpServer()).get("/").expect(200);

    const firstMetrics = await request(app.getHttpServer()).get("/metrics").expect(200);
    expect(firstMetrics.text).toContain('route="/"');
    expect(firstMetrics.text).not.toContain('route="/metrics"');

    const rootMatch = firstMetrics.text.match(ROOT_REQUESTS_TOTAL_PATTERN);
    expect(rootMatch).not.toBeNull();
    const rootCountBefore = Number(rootMatch?.[1] ?? 0);

    await request(app.getHttpServer()).get("/metrics").expect(200);
    await request(app.getHttpServer()).get("/metrics").expect(200);

    const secondMetrics = await request(app.getHttpServer()).get("/metrics").expect(200);
    expect(secondMetrics.text).not.toContain('route="/metrics"');

    const rootMatchAfter = secondMetrics.text.match(ROOT_REQUESTS_TOTAL_PATTERN);
    expect(Number(rootMatchAfter?.[1] ?? 0)).toBe(rootCountBefore);
  });
});
