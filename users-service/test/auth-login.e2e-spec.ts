import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import request from "supertest";
import type { App } from "supertest/types";
import type { Repository } from "typeorm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "./../src/app.module";
import { User } from "./../src/users/entities/user.entity";
import { UserStatus } from "./../src/users/enums/user-status.enum";

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

function decodeJwtPayload(token: string): JwtPayload {
  const [, payload] = token.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as JwtPayload;
}

describe("Auth login (e2e)", () => {
  let app: INestApplication<App>;
  let usersRepository: Repository<User>;

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

    usersRepository = app.get(getRepositoryToken(User));
  });

  afterEach(async () => {
    await app.close();
  });

  const uniqueEmail = () => `login-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  const registerPayload = () => ({
    email: uniqueEmail(),
    password: "secret1",
    firstName: "Ada",
    lastName: "Lovelace",
    role: "buyer",
  });

  it("POST /auth/login returns 200 with public user and jwt token", async () => {
    const payload = registerPayload();

    const registerResponse = await request(app.getHttpServer()).post("/auth/register").send(payload).expect(201);

    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: payload.email, password: payload.password })
      .expect(200);

    expect(response.body.user).toMatchObject({
      id: registerResponse.body.id,
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      role: payload.role,
      status: "active",
    });
    expect(response.body.user).not.toHaveProperty("password");
    expect(typeof response.body.token).toBe("string");
    expect(response.body.token.split(".")).toHaveLength(3);

    const jwtPayload = decodeJwtPayload(response.body.token);
    expect(jwtPayload.sub).toBe(registerResponse.body.id);
    expect(jwtPayload.email).toBe(payload.email);
    expect(jwtPayload.role).toBe(payload.role);
    expect(jwtPayload.exp - jwtPayload.iat).toBe(24 * 60 * 60);
  });

  it("POST /auth/login returns 401 with generic message for unknown email", async () => {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "missing@example.com", password: "secret1" })
      .expect(401);

    expect(response.body.message).toBe("Credenciais inválidas");
  });

  it("POST /auth/login returns 401 with generic message for wrong password", async () => {
    const payload = registerPayload();

    await request(app.getHttpServer()).post("/auth/register").send(payload).expect(201);

    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: payload.email, password: "wrong-password" })
      .expect(401);

    expect(response.body.message).toBe("Credenciais inválidas");
  });

  it("POST /auth/login returns 401 when account is inactive", async () => {
    const payload = registerPayload();

    const registerResponse = await request(app.getHttpServer()).post("/auth/register").send(payload).expect(201);

    await usersRepository.update({ id: registerResponse.body.id }, { status: UserStatus.INACTIVE });

    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: payload.email, password: payload.password })
      .expect(401);

    expect(response.body.message).toBe("Conta inativa");
  });

  it("POST /auth/login returns 400 for invalid email", async () => {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "not-an-email", password: "secret1" })
      .expect(400);

    expect(JSON.stringify(response.body)).toMatch(/email/i);
  });

  it("POST /auth/login returns 400 for short password", async () => {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "buyer@example.com", password: "123" })
      .expect(400);

    expect(JSON.stringify(response.body)).toMatch(/password/i);
  });

  it("POST /auth/login returns 400 for non-whitelisted properties", async () => {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "buyer@example.com", password: "secret1", role: "buyer" })
      .expect(400);

    expect(JSON.stringify(response.body)).toMatch(/property/i);
  });
});
