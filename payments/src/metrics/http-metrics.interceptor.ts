import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { type Observable, tap } from "rxjs";
import { MetricsService } from "./metrics.service";

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();

    if (this.shouldSkip(request)) {
      return next.handle();
    }

    const startedAt = process.hrtime.bigint();
    const method = request.method ?? "UNKNOWN";

    return next.handle().pipe(
      tap({
        next: (): void => {
          const response = httpContext.getResponse<Response>();
          this.record(method, request, response.statusCode ?? 200, startedAt);
        },
        error: (error: unknown): void => {
          this.record(method, request, this.extractStatusCode(error), startedAt);
        },
      }),
    );
  }

  private shouldSkip(request: Request): boolean {
    const path = request.path ?? request.url?.split("?")[0] ?? "";
    return path === "/metrics";
  }

  private resolveRoute(request: Request): string {
    const routePath = request.route?.path;
    if (typeof routePath === "string" && routePath.length > 0) {
      const baseUrl = typeof request.baseUrl === "string" ? request.baseUrl : "";
      const combined = `${baseUrl}${routePath}`;
      return combined.length > 0 ? combined : "unknown";
    }

    const path = request.path;
    if (typeof path === "string" && path.length > 0) {
      return path;
    }

    return "unknown";
  }

  private extractStatusCode(error: unknown): number {
    if (typeof error === "object" && error !== null) {
      const withStatus = error as { status?: unknown; statusCode?: unknown; getStatus?: () => unknown };
      if (typeof withStatus.getStatus === "function") {
        const status = withStatus.getStatus();
        if (typeof status === "number") {
          return status;
        }
      }
      if (typeof withStatus.status === "number") {
        return withStatus.status;
      }
      if (typeof withStatus.statusCode === "number") {
        return withStatus.statusCode;
      }
    }

    return 500;
  }

  private record(method: string, request: Request, statusCode: number, startedAt: bigint): void {
    const route = this.resolveRoute(request);
    const labels = {
      method,
      route,
      status_code: String(statusCode),
    };
    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;

    this.metricsService.httpRequestsTotal.inc(labels);
    this.metricsService.httpRequestDurationSeconds.observe(labels, durationSeconds);
  }
}
