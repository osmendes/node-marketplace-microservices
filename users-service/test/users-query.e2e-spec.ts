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

describe("Users query (e2e)", () => {
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

  const uniqueEmail = (prefix: string) =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  const registerUser = async (overrides: Partial<{ email: string; role: string; firstName: string }> = {}) => {
    const payload = {
      email: overrides.email ?? uniqueEmail("users"),
      password: "secret1",
      firstName: overrides.firstName ?? "Ada",
      lastName: "Lovelace",
      role: overrides.role ?? "buyer",
    };

    const response = await request(app.getHttpServer()).post("/auth/register").send(payload).expect(201);

    return { payload, user: response.body };
  };

  const loginUser = async (email: string, password = "secret1") => {
    const response = await request(app.getHttpServer()).post("/auth/login").send({ email, password }).expect(200);

    return response.body.token as string;
  };

  const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

  it("GET /users/profile returns the authenticated public user", async () => {
    const { payload, user } = await registerUser({ role: "buyer", firstName: "Profile" });
    const token = await loginUser(payload.email);

    const response = await request(app.getHttpServer()).get("/users/profile").set(authHeader(token)).expect(200);

    expect(response.body).toMatchObject({
      id: user.id,
      email: payload.email,
      firstName: "Profile",
      lastName: payload.lastName,
      role: "buyer",
      status: "active",
    });
    expect(response.body).not.toHaveProperty("password");
  });

  it("GET /users/profile without token returns 401", async () => {
    await request(app.getHttpServer()).get("/users/profile").expect(401);
  });

  it("GET /users/profile returns 404 when the token user no longer exists", async () => {
    const { payload, user } = await registerUser();
    const token = await loginUser(payload.email);

    await usersRepository.delete({ id: user.id });

    await request(app.getHttpServer()).get("/users/profile").set(authHeader(token)).expect(404);
  });

  it("GET /users/sellers returns only active sellers without password", async () => {
    const buyer = await registerUser({ role: "buyer", firstName: "Buyer" });
    const activeSeller = await registerUser({ role: "seller", firstName: "ActiveSeller" });
    const inactiveSeller = await registerUser({ role: "seller", firstName: "InactiveSeller" });

    await usersRepository.update({ id: inactiveSeller.user.id }, { status: UserStatus.INACTIVE });

    const token = await loginUser(buyer.payload.email);

    const response = await request(app.getHttpServer()).get("/users/sellers").set(authHeader(token)).expect(200);

    expect(Array.isArray(response.body)).toBe(true);

    const sellerIds = response.body.map((seller: { id: string }) => seller.id);
    expect(sellerIds).toContain(activeSeller.user.id);
    expect(sellerIds).not.toContain(inactiveSeller.user.id);
    expect(sellerIds).not.toContain(buyer.user.id);

    for (const seller of response.body) {
      expect(seller.role).toBe("seller");
      expect(seller.status).toBe("active");
      expect(seller).not.toHaveProperty("password");
    }
  });

  it("GET /users/sellers without token returns 401", async () => {
    await request(app.getHttpServer()).get("/users/sellers").expect(401);
  });

  it("GET /users/:id returns the public user for an existing id", async () => {
    const { payload, user } = await registerUser({ role: "seller", firstName: "ById" });
    const token = await loginUser(payload.email);

    const response = await request(app.getHttpServer()).get(`/users/${user.id}`).set(authHeader(token)).expect(200);

    expect(response.body).toMatchObject({
      id: user.id,
      email: payload.email,
      firstName: "ById",
      role: "seller",
      status: "active",
    });
    expect(response.body).not.toHaveProperty("password");
  });

  it("GET /users/:id returns 404 for an unknown id", async () => {
    const { payload } = await registerUser();
    const token = await loginUser(payload.email);

    await request(app.getHttpServer())
      .get("/users/00000000-0000-0000-0000-000000000000")
      .set(authHeader(token))
      .expect(404);
  });

  it("GET /users/:id without token returns 401", async () => {
    await request(app.getHttpServer()).get("/users/00000000-0000-0000-0000-000000000000").expect(401);
  });

  it("static routes profile and sellers are not captured by :id", async () => {
    const { payload } = await registerUser();
    const token = await loginUser(payload.email);

    await request(app.getHttpServer()).get("/users/profile").set(authHeader(token)).expect(200);
    await request(app.getHttpServer()).get("/users/sellers").set(authHeader(token)).expect(200);
  });
});
