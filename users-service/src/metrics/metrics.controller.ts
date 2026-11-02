import { Controller, Get, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { Public } from "../auth/decorators/public.decorator";
import { MetricsService } from "./metrics.service";

@ApiTags("Metrics")
@Controller()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Public()
  @Get("metrics")
  @ApiOperation({ summary: "Prometheus metrics exposition" })
  async getMetrics(@Res({ passthrough: true }) response: Response): Promise<string> {
    response.setHeader("Content-Type", this.metricsService.getContentType());
    return this.metricsService.getMetrics();
  }
}
