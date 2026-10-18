import { ForbiddenException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import type { CreateProductDto } from "./dto/create-product.dto";
import { Product } from "./entities/product.entity";
import { ProductsService } from "./products.service";

describe("ProductsService", () => {
  let productsService: ProductsService;
  let create: ReturnType<typeof vi.fn>;
  let save: ReturnType<typeof vi.fn>;

  const createDto: CreateProductDto = {
    name: "Wireless Mouse",
    description: "Ergonomic wireless mouse",
    price: 49.9,
    stock: 10,
  };

  const seller: AuthenticatedUser = {
    id: "11111111-1111-1111-1111-111111111111",
    email: "seller@example.com",
    role: "seller",
  };

  const buyer: AuthenticatedUser = {
    id: "22222222-2222-2222-2222-222222222222",
    email: "buyer@example.com",
    role: "buyer",
  };

  beforeEach(async () => {
    create = vi.fn();
    save = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: getRepositoryToken(Product),
          useValue: { create, save },
        },
      ],
    }).compile();

    productsService = module.get(ProductsService);
  });

  it("creates a product for a seller with sellerId from user and isActive true", async () => {
    const persisted: Product = {
      id: "33333333-3333-3333-3333-333333333333",
      name: createDto.name,
      description: createDto.description,
      price: "49.90",
      stock: createDto.stock,
      sellerId: seller.id,
      isActive: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    create.mockImplementation((data: Partial<Product>) => ({ ...data }));
    save.mockResolvedValue(persisted);

    const result = await productsService.create(createDto, seller);

    expect(create).toHaveBeenCalledWith({
      name: createDto.name,
      description: createDto.description,
      price: "49.90",
      stock: createDto.stock,
      sellerId: seller.id,
      isActive: true,
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(result).toEqual(persisted);
    expect(result.sellerId).toBe(seller.id);
    expect(result.isActive).toBe(true);
  });

  it("throws ForbiddenException when user is a buyer and does not save", async () => {
    await expect(productsService.create(createDto, buyer)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(productsService.create(createDto, buyer)).rejects.toThrow("Only sellers can create products");

    expect(create).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
