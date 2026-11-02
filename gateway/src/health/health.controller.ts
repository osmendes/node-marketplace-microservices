import { Controller, Get, Param } from "@nestjs/common";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { HealthCheck, HttpHealthIndicator, HealthCheckService as TerminusHealthCheckService } from "@nestjs/terminus";
import { SkipThrottle } from "@nestjs/throttler";
import { HealthCheckService } from "src/common/health/health-check.service";
import { serviceConfig } from "src/config/gateway.config";
import { HealthService } from "./health.service";

const HEALTH_PING_TIMEOUT_MS = 3000;

@SkipThrottle()
@Controller("health")
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly healthCheckService: HealthCheckService,
    private readonly terminusHealth: TerminusHealthCheckService,
    private readonly http: HttpHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: "Health check do gateway (Terminus + downstream HTTP)" })
  @ApiResponse({ status: 200, description: "Gateway e downstream saudáveis" })
  @ApiResponse({ status: 503, description: "Um ou mais downstream indisponíveis" })
  check() {
    return this.terminusHealth.check([
      () =>
        this.http.pingCheck("users-service", `${serviceConfig.users.url}/health`, {
          timeout: HEALTH_PING_TIMEOUT_MS,
        }),
      () =>
        this.http.pingCheck("products-service", `${serviceConfig.products.url}/health`, {
          timeout: HEALTH_PING_TIMEOUT_MS,
        }),
      () =>
        this.http.pingCheck("checkout-service", `${serviceConfig.checkout.url}/health`, {
          timeout: HEALTH_PING_TIMEOUT_MS,
        }),
      () =>
        this.http.pingCheck("payments-service", `${serviceConfig.payments.url}/health`, {
          timeout: HEALTH_PING_TIMEOUT_MS,
        }),
    ]);
  }

  @Get("services")
  @ApiOperation({ summary: "Health check de todos os serviços" })
  @ApiResponse({ status: 200, description: "Status de todos os serviços" })
  async getServicesHealth() {
    const services = await this.healthCheckService.checkAllServices();
    const overallStatus = services.every((s) => {
      return s.status === "healthy";
    })
      ? "healthy"
      : services.some((s) => s.status === "healthy")
        ? "degraded"
        : "unhealthy";

    return {
      overallStatus,
      timestamp: new Date().toISOString(),
      services,
      summary: {
        total: services.length,
        healthy: services.filter((s) => s.status === "healthy").length,
        unhealthy: services.filter((s) => s.status === "unhealthy").length,
        degraded: services.filter((s) => s.status === "degraded").length,
      },
    };
  }

  @Get("services/:serviceName")
  @ApiOperation({ summary: "Health check de um serviço específico" })
  @ApiResponse({ status: 200, description: "Status do serviço" })
  async getServiceHealth(@Param("serviceName") serviceName: string) {
    const cached = this.healthCheckService.getCachedHealth(serviceName);

    if (!cached) {
      return {
        status: "unknown",
        message: "Service not found or never checked",
        timestamp: new Date().toISOString(),
      };
    }

    return cached;
  }

  @Get("ready")
  @ApiOperation({ summary: "Get readiness status" })
  @ApiResponse({ status: 200, description: "Readiness status retrieved successfully" })
  async getReady() {
    return this.healthService.getReadyStatus();
  }

  @Get("live")
  @ApiOperation({ summary: "Get liveness status" })
  @ApiResponse({ status: 200, description: "Liveness status retrieved successfully" })
  async getLive() {
    return this.healthService.getLiveStatus();
  }
}
