import { type INestApplication, type Type, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MicroserviceHealthIndicator } from "@nestjs/terminus";
import { Test, type TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import type { App } from "supertest/types";
import { AppController } from "../../src/app.controller";
import { AppService } from "../../src/app.service";
import { HealthModule } from "../../src/health/health.module";
import { MetricsModule } from "../../src/metrics/metrics.module";
import { FakePaymentGatewayService } from "../../src/payments/fake-payment-gateway.service";
import { PaymentsModule } from "../../src/payments/payments.module";
import { patchTypeOrmColumnsForSqlite } from "./sqlite-typeorm";

export type CreateTestAppOptions = {
  controllers?: Type<unknown>[];
  /** When set, replaces FakePaymentGatewayService (avoids 500ms–2s latency in e2e). */
  fakePaymentGateway?: Pick<FakePaymentGatewayService, "process">;
};

/**
 * Builds a Nest app for e2e tests using SQLite in-memory instead of PostgreSQL.
 * Does not import AppModule / EventsModule so production DB and RabbitMQ consumer
 * are never started.
 */
export async function createTestApp(options: CreateTestAppOptions = {}): Promise<INestApplication<App>> {
  process.env.NODE_ENV = "test";
  process.env.RABBITMQ_URL ??= "amqp://admin:admin@localhost:5672";

  // Ensure entity decorators are registered before patching column metadata.
  await import("../../src/payments/entities/payment.entity");
  patchTypeOrmColumnsForSqlite();

  const moduleBuilder = Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      TypeOrmModule.forRoot({
        type: "better-sqlite3",
        database: ":memory:",
        dropSchema: true,
        synchronize: true,
        autoLoadEntities: true,
      }),
      MetricsModule,
      HealthModule,
      PaymentsModule,
    ],
    controllers: [AppController, ...(options.controllers ?? [])],
    providers: [AppService],
  })
    .overrideProvider(MicroserviceHealthIndicator)
    .useValue({
      pingCheck: async (key: string) => ({ [key]: { status: "up" } }),
    });

  if (options.fakePaymentGateway) {
    moduleBuilder.overrideProvider(FakePaymentGatewayService).useValue(options.fakePaymentGateway);
  }

  const moduleFixture: TestingModule = await moduleBuilder.compile();
  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();
  return app;
}
