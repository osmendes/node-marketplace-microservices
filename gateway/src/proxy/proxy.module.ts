import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { CircuitBreakerModule } from "src/common/circuit-breaker/circuit-breaker.module";
import { FallbackModule } from "src/common/fallback/fallback.module";
import { RetryModule } from "src/common/retry/retry.module";
import { TimeoutModule } from "src/common/timeout/timeout.module";
import { AuthModule } from "../auth/auth.module";
import { ProxyService } from "./service/proxy.service";
import { UsersProxyController } from "./users-proxy.controller";

@Module({
  imports: [HttpModule, CircuitBreakerModule, FallbackModule, TimeoutModule, RetryModule, AuthModule],
  controllers: [UsersProxyController],
  providers: [ProxyService],
  exports: [ProxyService],
})
export class ProxyModule {}
