import { beforeEach, describe, expect, it } from "vitest";
import { MetricsService } from "./metrics.service";

const DEFAULT_NODE_METRICS_PATTERN = /process_cpu|nodejs_heap|nodejs_eventloop/i;

describe("MetricsService", () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
    service.onModuleInit();
  });

  it("exposes http_requests_total counter and http_request_duration_seconds histogram", async () => {
    service.httpRequestsTotal.inc({ method: "GET", route: "/health", status_code: "200" });
    service.httpRequestDurationSeconds.observe({ method: "GET", route: "/health", status_code: "200" }, 0.012);

    const metrics = await service.getMetrics();

    expect(metrics).toContain("http_requests_total");
    expect(metrics).toContain("http_request_duration_seconds");
    expect(metrics).toContain('method="GET"');
    expect(metrics).toContain('route="/health"');
    expect(metrics).toContain('status_code="200"');
  });

  it("exposes payment business counters including rejected reason label", async () => {
    service.paymentsProcessedTotal.inc();
    service.paymentsApprovedTotal.inc();
    service.paymentsRejectedTotal.inc({ reason: "Limite excedido" });

    const metrics = await service.getMetrics();

    expect(metrics).toContain("payments_processed_total");
    expect(metrics).toContain("payments_approved_total");
    expect(metrics).toContain("payments_rejected_total");
    expect(metrics).toContain('reason="Limite excedido"');
  });

  it("includes default Node.js metrics from collectDefaultMetrics", async () => {
    const metrics = await service.getMetrics();

    expect(metrics).toMatch(DEFAULT_NODE_METRICS_PATTERN);
  });

  it("returns Prometheus content type", () => {
    expect(service.getContentType()).toContain("text/plain");
  });
});
