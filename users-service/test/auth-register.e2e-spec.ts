import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "./../src/app.module";

describe("Auth register (e2e)", () => {
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

  const uniqueEmail = () => `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  const validPayload = () => ({
    email: uniqueEmail(),
    password: "secret1",
    firstName: "Ada",
    lastName: "Lovelace",
    role: "buyer",
  });

  it("POST /auth/register returns 201 without password", async () => {
    const payload = validPayload();

    const response = await request(app.getHttpServer()).post("/auth/register").send(payload).expect(201);

    expect(response.body).toMatchObject({
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      role: payload.role,
      status: "active",
    });
    expect(response.body.id).toBeDefined();
    expect(response.body.createdAt).toBeDefined();
    expect(response.body.updatedAt).toBeDefined();
    expect(response.body).not.toHaveProperty("password");
  });

  it("POST /auth/register returns 409 when email already exists", async () => {
    const payload = validPayload();

    await request(app.getHttpServer()).post("/auth/register").send(payload).expect(201);

    const response = await request(app.getHttpServer()).post("/auth/register").send(payload).expect(409);

    expect(response.body.message).toMatch(/email/i);
  });

  it("POST /auth/register returns 400 for invalid email", async () => {
    const response = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validPayload(), email: "not-an-email" })
      .expect(400);

    expect(JSON.stringify(response.body)).toMatch(/email/i);
  });

  it("POST /auth/register returns 400 for short password", async () => {
    const response = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validPayload(), password: "123" })
      .expect(400);

    expect(JSON.stringify(response.body)).toMatch(/password/i);
  });

  it("POST /auth/register returns 400 for invalid firstName length", async () => {
    const response = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validPayload(), firstName: "a".repeat(101) })
      .expect(400);

    expect(JSON.stringify(response.body)).toMatch(/firstName/i);
  });

  it("POST /auth/register returns 400 for invalid role", async () => {
    const response = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validPayload(), role: "admin" })
      .expect(400);

    expect(JSON.stringify(response.body)).toMatch(/role/i);
  });

  it("POST /auth/register returns 400 for non-whitelisted properties", async () => {
    const response = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validPayload(), status: "active", id: "custom-id" })
      .expect(400);

    expect(JSON.stringify(response.body)).toMatch(/property/i);
  });
});
