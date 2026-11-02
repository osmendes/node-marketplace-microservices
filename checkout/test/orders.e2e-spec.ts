import { type INestApplication, ValidationPipe } from "@nestjs/common";
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
import { PaymentQueueService } from "./../src/events/payment-queue/payment-queue.service";
import { Order, OrderStatus } from "./../src/orders/entities/order.entity";
import { PaymentMethod } from "./../src/orders/enums/payment-method.enum";
import { ProductsClientService } from "./../src/products/products-client.service";

describe("Checkout and orders (e2e)", () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let cartRepository: Repository<Cart>;
  let cartItemRepository: Repository<CartItem>;
  let orderRepository: Repository<Order>;
  let productsClient: { getProduct: ReturnType<typeof vi.fn> };
  let paymentQueue: {
    publishPaymentOrder: ReturnType<typeof vi.fn>;
    publishPaymentOrderSafe: ReturnType<typeof vi.fn>;
  };

  const buyerId = "41111111-1111-4111-8111-111111111111";
  const sellerId = "42222222-2222-4222-8222-222222222222";
  const otherUserId = "43333333-3333-4333-8333-333333333333";
  const productId = "4aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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

    paymentQueue = {
      publishPaymentOrder: vi.fn().mockResolvedValue(undefined),
      publishPaymentOrderSafe: vi.fn().mockResolvedValue(undefined),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ProductsClientService)
      .useValue(productsClient)
      .overrideProvider(PaymentQueueService)
      .useValue(paymentQueue)
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
    orderRepository = app.get(getRepositoryToken(Order));
  });

  afterEach(async () => {
    const userIds = [buyerId, sellerId, otherUserId];
    const orders = await orderRepository.find({
      where: userIds.map((userId) => ({ userId })),
    });

    if (orders.length > 0) {
      await orderRepository.delete(orders.map((order) => order.id));
    }

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

  async function signToken(role: "seller" | "buyer", userId: string): Promise<string> {
    return jwtService.signAsync({
      sub: userId,
      email: `${role}@example.com`,
      role,
    });
  }

  async function seedActiveCart(userId: string): Promise<void> {
    const token = await signToken("buyer", userId);

    await request(app.getHttpServer())
      .post("/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId, quantity: 2 })
      .expect(200);
  }

  it("POST /cart/checkout returns 401 without token", async () => {
    await request(app.getHttpServer()).post("/cart/checkout").send({ paymentMethod: PaymentMethod.PIX }).expect(401);
  });

  it("GET /orders returns 401 without token", async () => {
    await request(app.getHttpServer()).get("/orders").expect(401);
  });

  it("GET /orders/:id returns 401 without token", async () => {
    await request(app.getHttpServer()).get("/orders/dddddddd-dddd-4ddd-8ddd-dddddddddddd").expect(401);
  });

  it("POST /cart/checkout returns 400 for invalid paymentMethod", async () => {
    const token = await signToken("buyer", buyerId);

    await request(app.getHttpServer())
      .post("/cart/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentMethod: "cash" })
      .expect(400);
  });

  it("POST /cart/checkout returns 400 when cart is empty", async () => {
    const token = await signToken("buyer", buyerId);

    await request(app.getHttpServer())
      .post("/cart/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentMethod: PaymentMethod.PIX })
      .expect(400);

    expect(paymentQueue.publishPaymentOrder).not.toHaveBeenCalled();
  });

  it("finalizes cart, creates pending order, and publishes payment message", async () => {
    await seedActiveCart(buyerId);
    const token = await signToken("buyer", buyerId);

    const response = await request(app.getHttpServer())
      .post("/cart/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentMethod: PaymentMethod.PIX })
      .expect(201);

    expect(response.body).toMatchObject({
      userId: buyerId,
      total: "201.00",
      paymentMethod: PaymentMethod.PIX,
      status: OrderStatus.PENDING,
    });
    expect(response.body.id).toBeDefined();
    expect(response.body.cartId).toBeDefined();

    const cart = await cartRepository.findOne({ where: { id: response.body.cartId } });
    expect(cart?.status).toBe(CartStatus.COMPLETED);

    expect(paymentQueue.publishPaymentOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: response.body.id,
        userId: buyerId,
        amount: 201,
        paymentMethod: PaymentMethod.PIX,
        items: [
          expect.objectContaining({
            productId,
            quantity: 2,
            price: 100.5,
          }),
        ],
      }),
    );
  });

  it("allows seller to checkout", async () => {
    const token = await signToken("seller", sellerId);

    await request(app.getHttpServer())
      .post("/cart/items")
      .set("Authorization", `Bearer ${token}`)
      .send({ productId, quantity: 1 })
      .expect(200);

    const response = await request(app.getHttpServer())
      .post("/cart/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentMethod: PaymentMethod.CREDIT_CARD })
      .expect(201);

    expect(response.body.userId).toBe(sellerId);
    expect(response.body.paymentMethod).toBe(PaymentMethod.CREDIT_CARD);
  });

  it("GET /orders returns empty array when user has no orders", async () => {
    const token = await signToken("buyer", buyerId);

    const response = await request(app.getHttpServer())
      .get("/orders")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it("GET /orders returns only the authenticated user's orders newest first", async () => {
    await seedActiveCart(buyerId);
    const buyerToken = await signToken("buyer", buyerId);

    const first = await request(app.getHttpServer())
      .post("/cart/checkout")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ paymentMethod: PaymentMethod.PIX })
      .expect(201);

    await request(app.getHttpServer())
      .post("/cart/items")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ productId, quantity: 1 })
      .expect(200);

    const second = await request(app.getHttpServer())
      .post("/cart/checkout")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ paymentMethod: PaymentMethod.BOLETO })
      .expect(201);

    const otherToken = await signToken("buyer", otherUserId);
    await request(app.getHttpServer())
      .post("/cart/items")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ productId, quantity: 1 })
      .expect(200);
    await request(app.getHttpServer())
      .post("/cart/checkout")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ paymentMethod: PaymentMethod.DEBIT_CARD })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get("/orders")
      .set("Authorization", `Bearer ${buyerToken}`)
      .expect(200);

    expect(response.body).toHaveLength(2);
    expect(response.body[0].id).toBe(second.body.id);
    expect(response.body[1].id).toBe(first.body.id);
    expect(response.body.every((order: Order) => order.userId === buyerId)).toBe(true);
  });

  it("GET /orders/:id returns the user's order and 404 for foreign/missing ids", async () => {
    await seedActiveCart(buyerId);
    const buyerToken = await signToken("buyer", buyerId);

    const created = await request(app.getHttpServer())
      .post("/cart/checkout")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ paymentMethod: PaymentMethod.PIX })
      .expect(201);

    const detail = await request(app.getHttpServer())
      .get(`/orders/${created.body.id}`)
      .set("Authorization", `Bearer ${buyerToken}`)
      .expect(200);

    expect(detail.body.id).toBe(created.body.id);

    const otherToken = await signToken("buyer", otherUserId);
    await request(app.getHttpServer())
      .get(`/orders/${created.body.id}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get("/orders/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee")
      .set("Authorization", `Bearer ${buyerToken}`)
      .expect(404);
  });
});
