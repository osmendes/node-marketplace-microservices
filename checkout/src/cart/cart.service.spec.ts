import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductsClientService } from "../products/products-client.service";
import { CartService } from "./cart.service";
import type { AddCartItemDto } from "./dto/add-cart-item.dto";
import { type Cart, CartStatus } from "./entities/cart.entity";
import type { CartItem } from "./entities/cart-item.entity";

describe("CartService", () => {
  let service: CartService;
  let cartRepository: {
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let cartItemRepository: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  let productsClient: {
    getProduct: ReturnType<typeof vi.fn>;
  };

  const userId = "11111111-1111-1111-1111-111111111111";
  const productId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const itemId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const cartId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

  const dto: AddCartItemDto = {
    productId,
    quantity: 2,
  };

  const activeProduct = {
    id: productId,
    name: "Notebook",
    price: 100.5,
    isActive: true,
  };

  beforeEach(() => {
    cartRepository = {
      findOne: vi.fn(),
      create: vi.fn((value) => value),
      save: vi.fn(async (value) => value),
    };

    cartItemRepository = {
      create: vi.fn((value) => value),
      save: vi.fn(async (value) => ({ id: itemId, ...value })),
      remove: vi.fn(async (value) => value),
    };

    productsClient = {
      getProduct: vi.fn(),
    };

    service = new CartService(
      cartRepository as never,
      cartItemRepository as never,
      productsClient as unknown as ProductsClientService,
    );
  });

  it("returns empty cart representation when user has no active cart", async () => {
    cartRepository.findOne.mockResolvedValue(null);

    const result = await service.getCartForUser(userId);

    expect(result).toEqual({
      id: null,
      userId,
      status: CartStatus.ACTIVE,
      total: "0.00",
      items: [],
      createdAt: null,
      updatedAt: null,
    });
  });

  it("returns active cart when it exists", async () => {
    const cart = {
      id: cartId,
      userId,
      status: CartStatus.ACTIVE,
      total: "100.50",
      items: [],
    } as Cart;

    cartRepository.findOne.mockResolvedValue(cart);

    await expect(service.getCartForUser(userId)).resolves.toEqual(cart);
  });

  it("throws BadRequestException when product is inactive", async () => {
    productsClient.getProduct.mockResolvedValue({ ...activeProduct, isActive: false });

    await expect(service.addItem(userId, dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(cartRepository.save).not.toHaveBeenCalled();
  });

  it("creates active cart and item on first add", async () => {
    productsClient.getProduct.mockResolvedValue(activeProduct);
    cartRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: cartId,
      userId,
      status: CartStatus.ACTIVE,
      total: "0.00",
      items: [
        {
          id: itemId,
          productId,
          productName: "Notebook",
          price: "100.50",
          quantity: 2,
          subtotal: "201.00",
        },
      ],
    } as Cart);

    cartRepository.save.mockImplementation(async (value: Cart) => {
      if (!value.id) {
        return { ...value, id: cartId };
      }
      return value;
    });

    const result = await service.addItem(userId, dto);

    expect(cartItemRepository.create).toHaveBeenCalledWith({
      cartId,
      productId,
      productName: "Notebook",
      price: "100.50",
      quantity: 2,
      subtotal: "201.00",
    });
    expect(result.total).toBe("201.00");
  });

  it("sums quantity and refreshes snapshot when product already in cart", async () => {
    productsClient.getProduct.mockResolvedValue({
      ...activeProduct,
      name: "Notebook Pro",
      price: 110,
    });

    const existingItem = {
      id: itemId,
      cartId,
      productId,
      productName: "Notebook",
      price: "100.50",
      quantity: 1,
      subtotal: "100.50",
    } as CartItem;

    const cart = {
      id: cartId,
      userId,
      status: CartStatus.ACTIVE,
      total: "100.50",
      items: [existingItem],
    } as Cart;

    cartRepository.findOne.mockResolvedValueOnce(cart).mockResolvedValueOnce({
      ...cart,
      items: [
        {
          ...existingItem,
          productName: "Notebook Pro",
          price: "110.00",
          quantity: 3,
          subtotal: "330.00",
        },
      ],
    } as Cart);

    const result = await service.addItem(userId, dto);

    expect(cartItemRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: itemId,
        quantity: 3,
        productName: "Notebook Pro",
        price: "110.00",
        subtotal: "330.00",
      }),
    );
    expect(result.total).toBe("330.00");
  });

  it("removes item and recalculates total", async () => {
    const remainingItem = {
      id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      productId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      productName: "Mouse",
      price: "50.00",
      quantity: 1,
      subtotal: "50.00",
    } as CartItem;

    const itemToRemove = {
      id: itemId,
      productId,
      productName: "Notebook",
      price: "100.50",
      quantity: 1,
      subtotal: "100.50",
    } as CartItem;

    cartRepository.findOne
      .mockResolvedValueOnce({
        id: cartId,
        userId,
        status: CartStatus.ACTIVE,
        total: "150.50",
        items: [itemToRemove, remainingItem],
      } as Cart)
      .mockResolvedValueOnce({
        id: cartId,
        userId,
        status: CartStatus.ACTIVE,
        total: "150.50",
        items: [remainingItem],
      } as Cart);

    const result = await service.removeItem(userId, itemId);

    expect(cartItemRepository.remove).toHaveBeenCalledWith(itemToRemove);
    expect(result.total).toBe("50.00");
  });

  it("throws NotFoundException when removing missing item", async () => {
    cartRepository.findOne.mockResolvedValue({
      id: cartId,
      userId,
      status: CartStatus.ACTIVE,
      total: "0.00",
      items: [],
    } as Cart);

    await expect(service.removeItem(userId, itemId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFoundException when removing item without active cart", async () => {
    cartRepository.findOne.mockResolvedValue(null);

    await expect(service.removeItem(userId, itemId)).rejects.toBeInstanceOf(NotFoundException);
  });
});
