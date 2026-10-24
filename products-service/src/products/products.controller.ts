import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { Public } from "../auth/decorators/public.decorator";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import { CreateProductDto } from "./dto/create-product.dto";
import { Product } from "./entities/product.entity";
import { ProductsService } from "./products.service";

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Controller("products")
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @Get()
  findAll(): Promise<Product[]> {
    return this.productsService.findAllActive();
  }

  @Public()
  @Get("seller/:sellerId")
  findBySeller(@Param("sellerId") sellerId: string): Promise<Product[]> {
    return this.productsService.findActiveBySellerId(sellerId);
  }

  @Public()
  @Get(":id")
  findOne(@Param("id") id: string): Promise<Product> {
    return this.productsService.findOneById(id);
  }

  @Post()
  create(@Body() dto: CreateProductDto, @Req() req: AuthenticatedRequest): Promise<Product> {
    return this.productsService.create(dto, req.user);
  }
}
