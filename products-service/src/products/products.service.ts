import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import type { CreateProductDto } from "./dto/create-product.dto";
import { Product } from "./entities/product.entity";

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
  ) {}

  async create(dto: CreateProductDto, user: AuthenticatedUser): Promise<Product> {
    if (user.role !== "seller") {
      throw new ForbiddenException("Only sellers can create products");
    }

    const product = this.productsRepository.create({
      name: dto.name,
      description: dto.description,
      price: dto.price.toFixed(2),
      stock: dto.stock,
      sellerId: user.id,
      isActive: true,
    });

    return this.productsRepository.save(product);
  }
}
