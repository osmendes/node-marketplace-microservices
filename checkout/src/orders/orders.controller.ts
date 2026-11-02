import { Controller, Get, Param, ParseUUIDPipe, Req } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { Request } from "express";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import type { Order } from "./entities/order.entity";
import { OrdersService } from "./orders.service";

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@ApiTags("orders")
@ApiBearerAuth("JWT-auth")
@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: "List orders for the authenticated user" })
  @ApiOkResponse({ description: "Orders ordered from newest to oldest" })
  @ApiUnauthorizedResponse({ description: "Missing or invalid JWT" })
  findAll(@Req() req: AuthenticatedRequest): Promise<Order[]> {
    return this.ordersService.findAllByUser(req.user.id);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a specific order belonging to the authenticated user" })
  @ApiOkResponse({ description: "Order details" })
  @ApiUnauthorizedResponse({ description: "Missing or invalid JWT" })
  @ApiNotFoundResponse({ description: "Order not found for the authenticated user" })
  findOne(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Order> {
    return this.ordersService.findOneByUser(req.user.id, id);
  }
}
