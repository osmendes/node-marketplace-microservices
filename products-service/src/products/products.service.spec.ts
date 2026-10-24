import { ForbiddenException, NotFoundException } from "@nestjs/common";
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
  let find: ReturnType<typeof vi.fn>;
  let findOne: ReturnType<typeof vi.fn>;

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

  const sampleProduct: Product = {
    id: "33333333-3333-3333-3333-333333333333",
    name: "Wireless Mouse",
    description: "Ergonomic wireless mouse",
    price: "49.90",
    stock: 10,
    sellerId: seller.id,
    isActive: true,
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  };

  beforeEach(async () => {
    create = vi.fn();
    save = vi.fn();
    find = vi.fn();
    findOne = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: getRepositoryToken(Product),
          useValue: { create, save, find, findOne },
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

  it("findAllActive returns active products ordered by createdAt DESC", async () => {
    find.mockResolvedValue([sampleProduct]);

    const result = await productsService.findAllActive();

    expect(find).toHaveBeenCalledWith({
      where: { isActive: true },
      order: { createdAt: "DESC" },
    });
    expect(result).toEqual([sampleProduct]);
  });

  it("findActiveBySellerId returns active products for the seller", async () => {
    find.mockResolvedValue([sampleProduct]);

    const result = await productsService.findActiveBySellerId(seller.id);

    expect(find).toHaveBeenCalledWith({
      where: { isActive: true, sellerId: seller.id },
    });
    expect(result).toEqual([sampleProduct]);
  });

  it("findActiveBySellerId returns empty array when seller has no products", async () => {
    find.mockResolvedValue([]);

    const result = await productsService.findActiveBySellerId("99999999-9999-9999-9999-999999999999");

    expect(result).toEqual([]);
  });

  it("findOneById returns the product when found", async () => {
    findOne.mockResolvedValue(sampleProduct);

    const result = await productsService.findOneById(sampleProduct.id);

    expect(findOne).toHaveBeenCalledWith({ where: { id: sampleProduct.id } });
    expect(result).toEqual(sampleProduct);
  });

  it("findOneById throws NotFoundException when product does not exist", async () => {
    findOne.mockResolvedValue(null);

    await expect(productsService.findOneById("00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(productsService.findOneById("00000000-0000-0000-0000-000000000000")).rejects.toThrow(
      "Product not found",
    );
  });
});
