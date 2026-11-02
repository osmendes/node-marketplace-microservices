import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { HealthCheckModule } from "src/common/health/health-check.module";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

@Module({
  imports: [
    TerminusModule,
    HttpModule.register({
      timeout: 3000,
    }),
    HealthCheckModule,
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
