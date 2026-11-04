import { type INestApplication, type Type, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { MicroserviceHealthIndicator } from "@nestjs/terminus";
import { Test, type TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import type { App } from "supertest/types";
import { vi } from "vitest";
import { AppController } from "../../src/app.controller";
import { AppService } from "../../src/app.service";
import { AuthModule } from "../../src/auth/auth.module";
import { JwtAuthGuard } from "../../src/auth/guards/jwt-auth.guard";
import { CartModule } from "../../src/cart/cart.module";
import { EventsModule } from "../../src/events/events.module";
import { PaymentQueueService } from "../../src/events/payment-queue/payment-queue.service";
import { RabbitmqService } from "../../src/events/rabbitmq/rabbitmq.service";
import { HealthModule } from "../../src/health/health.module";
import { MetricsModule } from "../../src/metrics/metrics.module";
import { OrdersModule } from "../../src/orders/orders.module";
import { ProductsClientService } from "../../src/products/products-client.service";
import { patchTypeOrmColumnsForSqlite } from "./sqlite-typeorm";

export type CreateTestAppOptions = {
  controllers?: Type<unknown>[];
  productsClient?: Partial<ProductsClientService> | Record<string, unknown>;
  paymentQueue?: Partial<PaymentQueueService> | Record<string, unknown>;
  rabbitmq?: Partial<RabbitmqService> | Record<string, unknown>;
};

function defaultProductsClient() {
  return { getProduct: vi.fn() };
}

function defaultPaymentQueue() {
  return {
    publishPaymentOrder: vi.fn(),
    publishPaymentOrderSafe: vi.fn(),
  };
}

function defaultRabbitmq() {
  return {
    onModuleInit: vi.fn(),
    onModuleDestroy: vi.fn(),
    getChannel: vi.fn(),
    waitForConnection: vi.fn().mockResolvedValue(false),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

/**
 * Builds a Nest app for e2e tests using SQLite in-memory instead of PostgreSQL.
 * Does not import AppModule so production database.config and real AMQP are never loaded.
 */
export async function createTestApp(options: CreateTestAppOptions = {}): Promise<INestApplication<App>> {
  process.env.JWT_SECRET ??= "test-jwt-secret-change-me";
  process.env.NODE_ENV = "test";

  await import("../../src/cart/entities/cart.entity");
  await import("../../src/cart/entities/cart-item.entity");
  await import("../../src/orders/entities/order.entity");
  patchTypeOrmColumnsForSqlite();

  const productsClient = options.productsClient ?? defaultProductsClient();
  const paymentQueue = options.paymentQueue ?? defaultPaymentQueue();
  const rabbitmq = options.rabbitmq ?? defaultRabbitmq();

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
      EventsModule,
      CartModule,
      OrdersModule,
      AuthModule,
    ],
    controllers: [AppController, ...(options.controllers ?? [])],
    providers: [
      AppService,
      {
        provide: APP_GUARD,
        useClass: JwtAuthGuard,
      },
    ],
  })
    .overrideProvider(ProductsClientService)
    .useValue(productsClient)
    .overrideProvider(PaymentQueueService)
    .useValue(paymentQueue)
    .overrideProvider(RabbitmqService)
    .useValue(rabbitmq)
    .overrideProvider(MicroserviceHealthIndicator)
    .useValue({
      pingCheck: vi.fn().mockResolvedValue({ rabbitmq: { status: "up" } }),
    });

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
