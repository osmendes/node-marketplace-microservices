import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { HttpException } from "@nestjs/common";
import type { Request, Response } from "express";
import { of, throwError } from "rxjs";
import { beforeEach, describe, expect, it } from "vitest";
import { HttpMetricsInterceptor } from "./http-metrics.interceptor";
import { MetricsService } from "./metrics.service";

describe("HttpMetricsInterceptor", () => {
  let interceptor: HttpMetricsInterceptor;
  let metricsService: MetricsService;

  const createContext = (request: Partial<Request>, response: Partial<Response> = {}): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => request as Request,
        getResponse: () => ({ statusCode: 200, ...response }) as Response,
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    metricsService = new MetricsService();
    metricsService.onModuleInit();
    interceptor = new HttpMetricsInterceptor(metricsService);
  });

  it("records method, route and status_code for successful requests", async () => {
    const context = createContext({
      method: "GET",
      path: "/health",
      route: { path: "/health" },
      baseUrl: "",
    } as Partial<Request>);
    const next: CallHandler = { handle: () => of({ ok: true }) };

    await new Promise<void>((resolve, reject) => {
      interceptor.intercept(context, next).subscribe({
        next: () => undefined,
        error: reject,
        complete: resolve,
      });
    });

    const metrics = await metricsService.getMetrics();
    expect(metrics).toContain('http_requests_total{method="GET",route="/health",status_code="200"}');
    expect(metrics).toContain("http_request_duration_seconds_count");
  });

  it("does not record metrics for GET /metrics", async () => {
    const context = createContext({
      method: "GET",
      path: "/metrics",
      url: "/metrics",
      route: { path: "/metrics" },
      baseUrl: "",
    } as Partial<Request>);
    const next: CallHandler = { handle: () => of("metrics") };

    await new Promise<void>((resolve, reject) => {
      interceptor.intercept(context, next).subscribe({
        next: () => undefined,
        error: reject,
        complete: resolve,
      });
    });

    const metrics = await metricsService.getMetrics();
    expect(metrics).not.toContain('route="/metrics"');
  });

  it("records status code from HttpException on error", async () => {
    const context = createContext({
      method: "GET",
      path: "/users/me",
      route: { path: "/users/me" },
      baseUrl: "",
    } as Partial<Request>);
    const next: CallHandler = {
      handle: () => throwError(() => new HttpException("Unauthorized", 401)),
    };

    await new Promise<void>((resolve) => {
      interceptor.intercept(context, next).subscribe({
        next: () => undefined,
        error: () => resolve(),
        complete: resolve,
      });
    });

    const metrics = await metricsService.getMetrics();
    expect(metrics).toContain('http_requests_total{method="GET",route="/users/me",status_code="401"}');
  });
});
