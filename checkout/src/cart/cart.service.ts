import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ProductsClientService } from "../products/products-client.service";
import { AddCartItemDto } from "./dto/add-cart-item.dto";
import { Cart, CartStatus } from "./entities/cart.entity";
import { CartItem } from "./entities/cart-item.entity";

export type EmptyCartResponse = {
  id: null;
  userId: string;
  status: CartStatus.ACTIVE;
  total: string;
  items: [];
  createdAt: null;
  updatedAt: null;
};

export type CartResponse = Cart | EmptyCartResponse;

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepository: Repository<CartItem>,
    private readonly productsClient: ProductsClientService,
  ) {}

  async getCartForUser(userId: string): Promise<CartResponse> {
    const cart = await this.findActiveCart(userId);

    if (!cart) {
      return this.buildEmptyCart(userId);
    }

    return cart;
  }

  async addItem(userId: string, dto: AddCartItemDto): Promise<Cart> {
    const product = await this.productsClient.getProduct(dto.productId);

    if (!product.isActive) {
      throw new BadRequestException("Product is not active");
    }

    let cart = await this.findActiveCart(userId);

    if (!cart) {
      cart = await this.cartRepository.save(
        this.cartRepository.create({
          userId,
          status: CartStatus.ACTIVE,
          total: "0.00",
          items: [],
        }),
      );
      cart.items = [];
    }

    const price = this.toDecimalString(product.price);
    const existingItem = cart.items?.find((item) => item.productId === dto.productId);

    if (existingItem) {
      existingItem.quantity += dto.quantity;
      existingItem.productName = product.name;
      existingItem.price = price;
      existingItem.subtotal = this.toDecimalString(Number(price) * existingItem.quantity);
      await this.cartItemRepository.save(existingItem);
    } else {
      const item = this.cartItemRepository.create({
        cartId: cart.id,
        productId: dto.productId,
        productName: product.name,
        price,
        quantity: dto.quantity,
        subtotal: this.toDecimalString(Number(price) * dto.quantity),
      });
      await this.cartItemRepository.save(item);
    }

    return this.reloadAndRecalculateTotal(cart.id);
  }

  async removeItem(userId: string, itemId: string): Promise<Cart> {
    const cart = await this.findActiveCart(userId);

    if (!cart) {
      throw new NotFoundException("Cart item not found");
    }

    const item = cart.items?.find((cartItem) => cartItem.id === itemId);

    if (!item) {
      throw new NotFoundException("Cart item not found");
    }

    await this.cartItemRepository.remove(item);

    return this.reloadAndRecalculateTotal(cart.id);
  }

  private findActiveCart(userId: string): Promise<Cart | null> {
    return this.cartRepository.findOne({
      where: {
        userId,
        status: CartStatus.ACTIVE,
      },
    });
  }

  private async reloadAndRecalculateTotal(cartId: string): Promise<Cart> {
    const cart = await this.cartRepository.findOne({
      where: { id: cartId },
    });

    if (!cart) {
      throw new NotFoundException("Cart not found");
    }

    const total = (cart.items ?? []).reduce((sum, item) => sum + Number(item.subtotal), 0);
    cart.total = this.toDecimalString(total);

    return this.cartRepository.save(cart);
  }

  private buildEmptyCart(userId: string): EmptyCartResponse {
    return {
      id: null,
      userId,
      status: CartStatus.ACTIVE,
      total: "0.00",
      items: [],
      createdAt: null,
      updatedAt: null,
    };
  }

  private toDecimalString(value: number | string): string {
    return Number(value).toFixed(2);
  }
}
