import { Body, Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { Request } from "express";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import { CheckoutDto } from "./dto/checkout.dto";
import type { Order } from "./entities/order.entity";
import { OrdersService } from "./orders.service";

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@ApiTags("cart")
@ApiBearerAuth("JWT-auth")
@Controller("cart")
export class CheckoutController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post("checkout")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Finalize the authenticated user's active cart into an order" })
  @ApiCreatedResponse({ description: "Order created and payment message published" })
  @ApiBadRequestResponse({ description: "Invalid paymentMethod or empty cart" })
  @ApiUnauthorizedResponse({ description: "Missing or invalid JWT" })
  checkout(@Body() dto: CheckoutDto, @Req() req: AuthenticatedRequest): Promise<Order> {
    return this.ordersService.checkout(req.user.id, dto);
  }
}
