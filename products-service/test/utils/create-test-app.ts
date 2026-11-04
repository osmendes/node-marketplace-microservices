import { type INestApplication, type Type, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { Test, type TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import type { App } from "supertest/types";
import { AppController } from "../../src/app.controller";
import { AppService } from "../../src/app.service";
import { AuthModule } from "../../src/auth/auth.module";
import { JwtAuthGuard } from "../../src/auth/guards/jwt-auth.guard";
import { HealthModule } from "../../src/health/health.module";
import { MetricsModule } from "../../src/metrics/metrics.module";
import { ProductsModule } from "../../src/products/products.module";
import { patchTypeOrmColumnsForSqlite } from "./sqlite-typeorm";

export type CreateTestAppOptions = {
  controllers?: Type<unknown>[];
};

/**
 * Builds a Nest app for e2e tests using SQLite in-memory instead of PostgreSQL.
 * Does not import AppModule so production database.config is never loaded.
 */
export async function createTestApp(options: CreateTestAppOptions = {}): Promise<INestApplication<App>> {
  process.env.JWT_SECRET ??= "test-jwt-secret-change-me";
  process.env.NODE_ENV = "test";

  // Ensure entity decorators are registered before patching column metadata.
  await import("../../src/products/entities/product.entity");
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
      ProductsModule,
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
