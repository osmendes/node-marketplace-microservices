import { Body, Controller, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import { CreateProductDto } from "./dto/create-product.dto";
import { Product } from "./entities/product.entity";
import { ProductsService } from "./products.service";

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Controller("products")
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  create(@Body() dto: CreateProductDto, @Req() req: AuthenticatedRequest): Promise<Product> {
    return this.productsService.create(dto, req.user);
  }
}
