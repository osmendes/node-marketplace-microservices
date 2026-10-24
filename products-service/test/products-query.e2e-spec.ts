import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import request from "supertest";
import type { App } from "supertest/types";
import type { Repository } from "typeorm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "./../src/app.module";
import { Product } from "./../src/products/entities/product.entity";

describe("GET /products query endpoints (e2e)", () => {
  let app: INestApplication<App>;
  let productsRepository: Repository<Product>;
  const createdIds: string[] = [];

  const sellerA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const sellerB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const sellerEmpty = "cccccccc-cccc-cccc-cccc-cccccccccccc";

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

    productsRepository = app.get(getRepositoryToken(Product));
  });

  afterEach(async () => {
    if (createdIds.length > 0) {
      await productsRepository.delete(createdIds);
      createdIds.length = 0;
    }
    await app.close();
  });

  async function seedProduct(data: {
    name: string;
    description?: string;
    price?: string;
    stock?: number;
    sellerId: string;
    isActive?: boolean;
    createdAt?: Date;
  }): Promise<Product> {
    const product = productsRepository.create({
      name: data.name,
      description: data.description ?? "Test product description",
      price: data.price ?? "10.00",
      stock: data.stock ?? 5,
      sellerId: data.sellerId,
      isActive: data.isActive ?? true,
    });
    const saved = await productsRepository.save(product);

    if (data.createdAt) {
      await productsRepository.update(saved.id, { createdAt: data.createdAt });
      saved.createdAt = data.createdAt;
    }

    createdIds.push(saved.id);
    return saved;
  }

  it("GET /products returns 200 with an array without token", async () => {
    const response = await request(app.getHttpServer()).get("/products").expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  it("GET /products returns only active products ordered by createdAt DESC", async () => {
    const older = await seedProduct({
      name: "Older Active",
      sellerId: sellerA,
      isActive: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const newer = await seedProduct({
      name: "Newer Active",
      sellerId: sellerA,
      isActive: true,
      createdAt: new Date("2026-01-03T00:00:00.000Z"),
    });
    await seedProduct({
      name: "Inactive Product",
      sellerId: sellerA,
      isActive: false,
      createdAt: new Date("2026-01-04T00:00:00.000Z"),
    });

    const response = await request(app.getHttpServer()).get("/products").expect(200);

    const seeded = response.body.filter((p: Product) => createdIds.includes(p.id));
    expect(seeded.map((p: Product) => p.id)).toEqual([newer.id, older.id]);
    expect(seeded.every((p: Product) => p.isActive === true)).toBe(true);
    expect(seeded.some((p: Product) => p.name === "Inactive Product")).toBe(false);
  });

  it("GET /products/seller/:sellerId returns only that seller active products without token", async () => {
    const productA = await seedProduct({
      name: "Seller A Active",
      sellerId: sellerA,
      isActive: true,
    });
    await seedProduct({
      name: "Seller A Inactive",
      sellerId: sellerA,
      isActive: false,
    });
    await seedProduct({
      name: "Seller B Active",
      sellerId: sellerB,
      isActive: true,
    });

    const response = await request(app.getHttpServer()).get(`/products/seller/${sellerA}`).expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(productA.id);
    expect(response.body[0].sellerId).toBe(sellerA);
    expect(response.body[0].isActive).toBe(true);
  });

  it("GET /products/seller/:sellerId returns empty array when seller has no products", async () => {
    const response = await request(app.getHttpServer()).get(`/products/seller/${sellerEmpty}`).expect(200);

    expect(response.body).toEqual([]);
  });

  it("GET /products/:id returns product without token", async () => {
    const product = await seedProduct({
      name: "Detail Product",
      description: "Full detail description",
      price: "29.99",
      stock: 7,
      sellerId: sellerA,
      isActive: true,
    });

    const response = await request(app.getHttpServer()).get(`/products/${product.id}`).expect(200);

    expect(response.body).toMatchObject({
      id: product.id,
      name: "Detail Product",
      description: "Full detail description",
      stock: 7,
      sellerId: sellerA,
      isActive: true,
    });
    expect(Number(response.body.price)).toBeCloseTo(29.99, 2);
    expect(response.body.createdAt).toBeDefined();
    expect(response.body.updatedAt).toBeDefined();
  });

  it("GET /products/:id returns 404 for unknown id", async () => {
    await request(app.getHttpServer()).get("/products/00000000-0000-0000-0000-000000000000").expect(404);
  });

  it("GET /products/seller/:sellerId is not captured by :id route", async () => {
    await seedProduct({
      name: "Route Order Product",
      sellerId: sellerA,
      isActive: true,
    });

    const response = await request(app.getHttpServer()).get(`/products/seller/${sellerA}`).expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body[0].sellerId).toBe(sellerA);
  });

  it("POST /products remains protected without token", async () => {
    await request(app.getHttpServer())
      .post("/products")
      .send({
        name: "Should Fail",
        description: "Auth required",
        price: 10,
        stock: 1,
      })
      .expect(401);
  });
});
