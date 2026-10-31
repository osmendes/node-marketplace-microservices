import { BadGatewayException, type INestApplication, NotFoundException, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, type TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import request from "supertest";
import type { App } from "supertest/types";
import type { Repository } from "typeorm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "./../src/app.module";
import { Cart, CartStatus } from "./../src/cart/entities/cart.entity";
import { CartItem } from "./../src/cart/entities/cart-item.entity";
import { ProductsClientService } from "./../src/products/products-client.service";

describe("Cart management (e2e)", () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let cartRepository: Repository<Cart>;
  let cartItemRepository: Repository<CartItem>;
  let productsClient: { getProduct: ReturnType<typeof vi.fn> };

  const buyerId = "11111111-1111-4111-8111-111111111111";
  const sellerId = "22222222-2222-4222-8222-222222222222";
  const otherUserId = "33333333-3333-4333-8333-333333333333";
  const productId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const otherProductId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  const activeProduct = {
    id: productId,
    name: "Notebook",
    price: 100.5,
    isActive: true,
  };

  beforeEach(async () => {
    productsClient = {
      getProduct: vi.fn().mockResolvedValue(activeProduct),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ProductsClientService)
      .useValue(productsClient)
      .compile();

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
    cartRepository = app.get(getRepositoryToken(Cart));
    cartItemRepository = app.get(getRepositoryToken(CartItem));
  });

  afterEach(async () => {
    const userIds = [buyerId, sellerId, otherUserId];
    const carts = await cartRepository.find({
      where: userIds.map((userId) => ({ userId })),
    });

    if (carts.length > 0) {
      const cartIds = carts.map((cart) => cart.id);
      await cartItemRepository.createQueryBuilder().delete().where("cartId IN (:...cartIds)", { cartIds }).execute();
      await cartRepository.delete(cartIds);
    }

    await app.close();
  });

  async function signToken(role: "seller" | "buyer", userId: string) {
    return jwtService.signAsync({
      sub: userId,
      email: `${role}@example.com`,
      role,
    });
  }

  it("GET /cart returns 401 without token", async () => {
    await request(app.getHttpServer()).get("/cart").expect(401);
  });

  it("POST /cart/items returns 401 without token", async () => {
    await request(app.getHttpServer()).post("/cart/items").send({ productId, quantity: 1 }).expect(401);
  });

  it("DELETE /cart/items/:itemId returns 401 without token", async () => {
    await request(app.getHttpServer()).delete(`/cart/items/${productId}`).expect(401);
  });

  it("GET /cart returns empty cart when user has no active cart", async () => {
    const token = await signToken("buyer", buyerId);

    const response = await request(app.getHttpServer())
      .get("/cart")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      id: null,
      userId: buyerId,
      status: CartStatus.ACTIVE,
      total: "0.00",
      items: [],
      createdAt: null,
      updatedAt: null,
    });
  });

  it("POST /cart/items returns 400 for invalid body", async () => {
    const token = await signToken("buyer", buyerId);

    await request(app.getHttpServer())
      .post("/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: "not-a-uuid", quantity: 0 })
      .expect(400);
  });

  it("POST /cart/items returns 400 for inactive product", async () => {
    productsClient.getProduct.mockResolvedValue({ ...activeProduct, isActive: false });
    const token = await signToken("buyer", buyerId);

    await request(app.getHttpServer())
      .post("/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId, quantity: 1 })
      .expect(400);
  });

  it("POST /cart/items returns 404 when product does not exist", async () => {
    productsClient.getProduct.mockRejectedValue(new NotFoundException("Product not found"));
    const token = await signToken("buyer", buyerId);

    await request(app.getHttpServer())
      .post("/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId, quantity: 1 })
      .expect(404);
  });

  it("POST /cart/items returns 502 when products-service is unavailable", async () => {
    productsClient.getProduct.mockRejectedValue(new BadGatewayException("Failed to fetch product"));
    const token = await signToken("buyer", buyerId);

    await request(app.getHttpServer())
      .post("/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId, quantity: 1 })
      .expect(502);
  });

  it("adds item, sums quantity for same product, and recalculates totals", async () => {
    const token = await signToken("buyer", buyerId);

    const first = await request(app.getHttpServer())
      .post("/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId, quantity: 2 })
      .expect(200);

    expect(first.body.userId).toBe(buyerId);
    expect(first.body.status).toBe(CartStatus.ACTIVE);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.items[0]).toMatchObject({
      productId,
      productName: "Notebook",
      quantity: 2,
    });
    expect(first.body.items[0].price).toBe("100.50");
    expect(first.body.items[0].subtotal).toBe("201.00");
    expect(first.body.total).toBe("201.00");

    productsClient.getProduct.mockResolvedValue({
      ...activeProduct,
      name: "Notebook Pro",
      price: 110,
    });

    const second = await request(app.getHttpServer())
      .post("/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId, quantity: 1 })
      .expect(200);

    expect(second.body.items).toHaveLength(1);
    expect(second.body.items[0]).toMatchObject({
      productId,
      productName: "Notebook Pro",
      quantity: 3,
      price: "110.00",
      subtotal: "330.00",
    });
    expect(second.body.total).toBe("330.00");

    const activeCarts = await cartRepository.count({
      where: { userId: buyerId, status: CartStatus.ACTIVE },
    });
    expect(activeCarts).toBe(1);
  });

  it("allows seller to manage cart and delete item", async () => {
    const token = await signToken("seller", sellerId);

    const created = await request(app.getHttpServer())
      .post("/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId, quantity: 1 })
      .expect(200);

    const itemId = created.body.items[0].id as string;

    const listed = await request(app.getHttpServer()).get("/cart").set("Authorization", `Bearer ${token}`).expect(200);

    expect(listed.body.items).toHaveLength(1);

    const deleted = await request(app.getHttpServer())
      .delete(`/cart/items/${itemId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(deleted.body.items).toHaveLength(0);
    expect(deleted.body.total).toBe("0.00");
  });

  it("returns 404 when deleting another user's cart item", async () => {
    const ownerToken = await signToken("buyer", buyerId);
    const otherToken = await signToken("buyer", otherUserId);

    const created = await request(app.getHttpServer())
      .post("/cart/items")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ productId, quantity: 1 })
      .expect(200);

    const itemId = created.body.items[0].id as string;

    await request(app.getHttpServer())
      .delete(`/cart/items/${itemId}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(404);

    const ownerCart = await request(app.getHttpServer())
      .get("/cart")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);

    expect(ownerCart.body.items).toHaveLength(1);
  });

  it("adds a second distinct product without merging items", async () => {
    const token = await signToken("buyer", buyerId);

    await request(app.getHttpServer())
      .post("/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId, quantity: 1 })
      .expect(200);

    productsClient.getProduct.mockResolvedValue({
      id: otherProductId,
      name: "Mouse",
      price: 50,
      isActive: true,
    });

    const response = await request(app.getHttpServer())
      .post("/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId: otherProductId, quantity: 2 })
      .expect(200);

    expect(response.body.items).toHaveLength(2);
    expect(response.body.total).toBe("200.50");
  });
});
