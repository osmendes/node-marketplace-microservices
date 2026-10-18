import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { HealthResponse } from "./app.service";
import { AppService } from "./app.service";
import { Public } from "./auth/decorators/public.decorator";

@ApiTags("Health")
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Hello World" })
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get("health")
  @ApiOperation({ summary: "Service health check" })
  getHealth(): HealthResponse {
    return this.appService.getHealth();
  }
}
