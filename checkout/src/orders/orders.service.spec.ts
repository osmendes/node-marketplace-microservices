import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CartService } from "../cart/cart.service";
import { CartStatus } from "../cart/entities/cart.entity";
import type { CartItem } from "../cart/entities/cart-item.entity";
import type { PaymentQueueService } from "../events/payment-queue/payment-queue.service";
import { CheckoutDto } from "./dto/checkout.dto";
import { type Order, OrderStatus } from "./entities/order.entity";
import { PaymentMethod } from "./enums/payment-method.enum";
import { OrdersService } from "./orders.service";

describe("OrdersService", () => {
  let service: OrdersService;
  let orderRepository: {
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  let cartService: {
    getActiveCart: ReturnType<typeof vi.fn>;
    markCartCompleted: ReturnType<typeof vi.fn>;
  };
  let paymentQueueService: {
    publishPaymentOrder: ReturnType<typeof vi.fn>;
  };
  let dataSource: {
    transaction: ReturnType<typeof vi.fn>;
  };

  const userId = "11111111-1111-4111-8111-111111111111";
  const otherUserId = "22222222-2222-4222-8222-222222222222";
  const cartId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const orderId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const productId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  const dto: CheckoutDto = {
    paymentMethod: PaymentMethod.PIX,
  };

  const cartItem = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    productId,
    productName: "Notebook",
    price: "100.50",
    quantity: 2,
    subtotal: "201.00",
  } as CartItem;

  const activeCart = {
    id: cartId,
    userId,
    status: CartStatus.ACTIVE,
    total: "201.00",
    items: [cartItem],
  };

  const pendingOrder = {
    id: orderId,
    userId,
    cartId,
    total: "201.00",
    paymentMethod: PaymentMethod.PIX,
    status: OrderStatus.PENDING,
    createdAt: new Date("2026-11-02T10:00:00.000Z"),
    updatedAt: new Date("2026-11-02T10:00:00.000Z"),
  } as Order;

  beforeEach(() => {
    orderRepository = {
      find: vi.fn(),
      findOne: vi.fn(),
    };

    cartService = {
      getActiveCart: vi.fn(),
      markCartCompleted: vi.fn(),
    };

    paymentQueueService = {
      publishPaymentOrder: vi.fn().mockResolvedValue(undefined),
    };

    dataSource = {
      transaction: vi.fn(async (callback: (manager: unknown) => Promise<Order>) => {
        const manager = {
          create: vi.fn((_entity: unknown, value: Partial<Order>) => value),
          save: vi.fn(async (value: Order | { status: CartStatus }) => {
            if ("paymentMethod" in value || "cartId" in value) {
              return { ...pendingOrder, ...value, id: orderId };
            }
            return value;
          }),
          findOne: vi.fn().mockResolvedValue({ ...activeCart }),
        };
        return callback(manager);
      }),
    };

    service = new OrdersService(
      orderRepository as never,
      cartService as unknown as CartService,
      paymentQueueService as unknown as PaymentQueueService,
      dataSource as never,
    );
  });

  it("creates pending order, completes cart, and publishes payment message", async () => {
    cartService.getActiveCart.mockResolvedValue(activeCart);

    const result = await service.checkout(userId, dto);

    expect(result).toEqual(
      expect.objectContaining({
        id: orderId,
        userId,
        cartId,
        total: "201.00",
        paymentMethod: PaymentMethod.PIX,
        status: OrderStatus.PENDING,
      }),
    );
    expect(paymentQueueService.publishPaymentOrder).toHaveBeenCalledWith({
      orderId,
      userId,
      amount: 201,
      items: [
        {
          productId,
          quantity: 2,
          price: 100.5,
        },
      ],
      paymentMethod: PaymentMethod.PIX,
    });
  });

  it("throws BadRequestException when cart is missing", async () => {
    cartService.getActiveCart.mockResolvedValue(null);

    await expect(service.checkout(userId, dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(paymentQueueService.publishPaymentOrder).not.toHaveBeenCalled();
  });

  it("throws BadRequestException when cart has no items", async () => {
    cartService.getActiveCart.mockResolvedValue({
      ...activeCart,
      items: [],
      total: "0.00",
    });

    await expect(service.checkout(userId, dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(paymentQueueService.publishPaymentOrder).not.toHaveBeenCalled();
  });

  it("propagates payment publish failures after persisting the order", async () => {
    cartService.getActiveCart.mockResolvedValue(activeCart);
    paymentQueueService.publishPaymentOrder.mockRejectedValue(new Error("broker down"));

    await expect(service.checkout(userId, dto)).rejects.toThrow("broker down");
    expect(dataSource.transaction).toHaveBeenCalled();
  });

  it("lists only the authenticated user's orders newest first", async () => {
    const orders = [pendingOrder];
    orderRepository.find.mockResolvedValue(orders);

    const result = await service.findAllByUser(userId);

    expect(result).toEqual(orders);
    expect(orderRepository.find).toHaveBeenCalledWith({
      where: { userId },
      order: { createdAt: "DESC" },
    });
  });

  it("returns an order belonging to the authenticated user", async () => {
    orderRepository.findOne.mockResolvedValue(pendingOrder);

    await expect(service.findOneByUser(userId, orderId)).resolves.toEqual(pendingOrder);
    expect(orderRepository.findOne).toHaveBeenCalledWith({
      where: {
        id: orderId,
        userId,
      },
    });
  });

  it("throws NotFoundException when order is missing or belongs to another user", async () => {
    orderRepository.findOne.mockResolvedValue(null);

    await expect(service.findOneByUser(otherUserId, orderId)).rejects.toBeInstanceOf(NotFoundException);
  });
});
