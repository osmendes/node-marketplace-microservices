import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "./app.service";
import { AppService } from "./app.service";
import { Public } from "./auth/decorators/public.decorator";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get("health")
  getHealth(): HealthResponse {
    return this.appService.getHealth();
  }
}
