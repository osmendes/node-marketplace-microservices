import { Controller, Get, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";
import { MetricsService } from "./metrics.service";

@SkipThrottle()
@Controller()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get("metrics")
  async getMetrics(@Res({ passthrough: true }) response: Response): Promise<string> {
    response.setHeader("Content-Type", this.metricsService.getContentType());
    return this.metricsService.getMetrics();
  }
}
