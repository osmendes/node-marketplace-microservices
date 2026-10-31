import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { Request } from "express";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import { type CartResponse, CartService } from "./cart.service";
import { AddCartItemDto } from "./dto/add-cart-item.dto";
import type { Cart } from "./entities/cart.entity";

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@ApiTags("cart")
@ApiBearerAuth("JWT-auth")
@Controller("cart")
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: "Get the authenticated user's active cart" })
  @ApiOkResponse({ description: "Active cart or empty cart representation" })
  @ApiUnauthorizedResponse({ description: "Missing or invalid JWT" })
  getCart(@Req() req: AuthenticatedRequest): Promise<CartResponse> {
    return this.cartService.getCartForUser(req.user.id);
  }

  @Post("items")
  @HttpCode(200)
  @ApiOperation({ summary: "Add an item to the authenticated user's cart" })
  @ApiOkResponse({ description: "Updated cart after add or quantity sum" })
  @ApiBadRequestResponse({ description: "Invalid body or inactive product" })
  @ApiUnauthorizedResponse({ description: "Missing or invalid JWT" })
  @ApiNotFoundResponse({ description: "Product not found in products-service" })
  @ApiResponse({ status: 502, description: "products-service unavailable" })
  addItem(@Body() dto: AddCartItemDto, @Req() req: AuthenticatedRequest): Promise<Cart> {
    return this.cartService.addItem(req.user.id, dto);
  }

  @Delete("items/:itemId")
  @ApiOperation({ summary: "Remove an item from the authenticated user's cart" })
  @ApiOkResponse({ description: "Updated cart after item removal" })
  @ApiUnauthorizedResponse({ description: "Missing or invalid JWT" })
  @ApiNotFoundResponse({ description: "Cart item not found for the authenticated user" })
  removeItem(
    @Param("itemId", new ParseUUIDPipe({ version: "4" })) itemId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Cart> {
    return this.cartService.removeItem(req.user.id, itemId);
  }
}
