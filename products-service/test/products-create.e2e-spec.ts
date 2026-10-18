import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, type TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import request from "supertest";
import type { App } from "supertest/types";
import type { Repository } from "typeorm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "./../src/app.module";
import { Product } from "./../src/products/entities/product.entity";

describe("POST /products (e2e)", () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let productsRepository: Repository<Product>;
  const createdIds: string[] = [];

  const validBody = {
    name: "Wireless Mouse",
    description: "Ergonomic wireless mouse",
    price: 49.9,
    stock: 10,
  };

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

    jwtService = app.get(JwtService);
    productsRepository = app.get(getRepositoryToken(Product));
  });

  afterEach(async () => {
    if (createdIds.length > 0) {
      await productsRepository.delete(createdIds);
      createdIds.length = 0;
    }
    await app.close();
  });

  async function signToken(role: "seller" | "buyer", userId = "11111111-1111-1111-1111-111111111111") {
    return jwtService.signAsync({
      sub: userId,
      email: `${role}@example.com`,
      role,
    });
  }

  it("returns 201 and persists product for seller", async () => {
    const sellerId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const token = await signToken("seller", sellerId);

    const response = await request(app.getHttpServer())
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send(validBody)
      .expect(201);

    expect(response.body).toMatchObject({
      name: validBody.name,
      description: validBody.description,
      stock: validBody.stock,
      sellerId,
      isActive: true,
    });
    expect(response.body.id).toBeDefined();
    expect(response.body.createdAt).toBeDefined();
    expect(response.body.updatedAt).toBeDefined();
    expect(Number(response.body.price)).toBeCloseTo(validBody.price, 2);

    createdIds.push(response.body.id);

    const stored = await productsRepository.findOneBy({ id: response.body.id });
    expect(stored).not.toBeNull();
    expect(stored?.sellerId).toBe(sellerId);
    expect(stored?.isActive).toBe(true);
  });

  it("returns 403 for buyer with valid body", async () => {
    const token = await signToken("buyer");

    await request(app.getHttpServer())
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send(validBody)
      .expect(403);

    const count = await productsRepository.count({
      where: { name: validBody.name, sellerId: "11111111-1111-1111-1111-111111111111" },
    });
    expect(count).toBe(0);
  });

  it("returns 401 without token", async () => {
    await request(app.getHttpServer()).post("/products").send(validBody).expect(401);
  });

  it("returns 401 for invalid token signature", async () => {
    const forged = await new JwtService({ secret: "wrong-secret" }).signAsync({
      sub: "11111111-1111-1111-1111-111111111111",
      email: "seller@example.com",
      role: "seller",
    });

    await request(app.getHttpServer())
      .post("/products")
      .set("Authorization", `Bearer ${forged}`)
      .send(validBody)
      .expect(401);
  });

  it("returns 401 for expired token", async () => {
    const expired = await jwtService.signAsync(
      {
        sub: "11111111-1111-1111-1111-111111111111",
        email: "seller@example.com",
        role: "seller",
      },
      { expiresIn: "-1s" },
    );

    await request(app.getHttpServer())
      .post("/products")
      .set("Authorization", `Bearer ${expired}`)
      .send(validBody)
      .expect(401);
  });

  it("returns 400 for invalid price", async () => {
    const token = await signToken("seller");

    await request(app.getHttpServer())
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validBody, price: 0 })
      .expect(400);
  });

  it("returns 400 for negative stock", async () => {
    const token = await signToken("seller");

    await request(app.getHttpServer())
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validBody, stock: -1 })
      .expect(400);
  });

  it("returns 400 when name exceeds 255 characters", async () => {
    const token = await signToken("seller");

    await request(app.getHttpServer())
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validBody, name: "a".repeat(256) })
      .expect(400);
  });

  it("returns 400 when sellerId is sent in body", async () => {
    const token = await signToken("seller");

    await request(app.getHttpServer())
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validBody, sellerId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" })
      .expect(400);
  });

  it("returns 400 when isActive is sent in body", async () => {
    const token = await signToken("seller");

    await request(app.getHttpServer())
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...validBody, isActive: false })
      .expect(400);
  });
});
