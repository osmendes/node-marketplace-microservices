import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "./../src/app.module";

describe("Auth validate-token (e2e)", () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const uniqueEmail = () => `validate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  const registerAndLogin = async () => {
    const payload = {
      email: uniqueEmail(),
      password: "secret1",
      firstName: "Ada",
      lastName: "Lovelace",
      role: "buyer",
    };

    const registerResponse = await request(app.getHttpServer()).post("/auth/register").send(payload).expect(201);

    const loginResponse = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: payload.email, password: payload.password })
      .expect(200);

    return {
      userId: registerResponse.body.id as string,
      email: payload.email,
      role: payload.role,
      token: loginResponse.body.token as string,
    };
  };

  it("GET /auth/validate-token with valid JWT returns userId, email and role", async () => {
    const session = await registerAndLogin();

    const response = await request(app.getHttpServer())
      .get("/auth/validate-token")
      .set("Authorization", `Bearer ${session.token}`)
      .expect(200);

    expect(response.body).toEqual({
      userId: session.userId,
      email: session.email,
      role: session.role,
    });
  });

  it("GET /auth/validate-token without token returns 401", async () => {
    await request(app.getHttpServer()).get("/auth/validate-token").expect(401);
  });

  it("GET /auth/validate-token with invalid token returns 401", async () => {
    await request(app.getHttpServer())
      .get("/auth/validate-token")
      .set("Authorization", "Bearer invalid.token.value")
      .expect(401);
  });
});
