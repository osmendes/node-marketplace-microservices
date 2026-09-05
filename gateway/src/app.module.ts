import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { CircuitBreakerModule } from "./common/circuit-breaker/circuit-breaker.module";
import { FallbackModule } from "./common/fallback/fallback.module";
import { HealthCheckModule } from "./common/health/health-check.module";
import { RetryModule } from "./common/retry/retry.module";
import { TimeoutModule } from "./common/timeout/timeout.module";
import { CustomThrottlerGuard } from "./guards/throttler.guard";
import { HealthModule } from "./health/health.module";
import { LogginMiddleware } from "./middleware/loggin/loggin.middleware";
import { MiddlewareModule } from "./middleware/middleware.module";
import { ProxyModule } from "./proxy/proxy.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => [
        {
          name: "short",
          ttl: 1000, // 1 second
          limit: configService.get<number>("RATE_LIMIT_SHORT", 10), // 100 requests per minute
        },
        {
          name: "medium",
          ttl: 60000, // 1 minute
          limit: configService.get<number>("RATE_LIMIT_MEDIUM", 100), // 100 requests per minute
        },
        {
          name: "long",
          ttl: 900000, // 15 minutes
          limit: configService.get<number>("RATE_LIMIT_LONG", 1000), // 1000 requests per 15 minutes
        },
      ],
      inject: [ConfigService],
    }),
    ProxyModule,
    MiddlewareModule,
    AuthModule,
    HealthModule,
    HealthCheckModule,
    FallbackModule,
    CircuitBreakerModule,
    TimeoutModule,
    RetryModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: CustomThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LogginMiddleware).forRoutes("*");
  }
}
