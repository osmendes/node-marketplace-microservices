import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard } from "../guards/auth.guard";
import { ProxyService } from "../proxy/service/proxy.service";

interface GatewayUser {
  userId: string;
  email: string;
  role: string;
}

type AuthenticatedRequest = Request & { user: GatewayUser };

@ApiTags("Cart")
@ApiBearerAuth("JWT-auth")
@UseGuards(JwtAuthGuard)
@Controller("cart")
export class CartProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Post("items")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Add item to cart via checkout-service" })
  addItem(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    return this.proxyService.proxyRequest("checkout", "POST", "/cart/items", body, this.forwardHeaders(req), req.user);
  }

  @Get()
  @ApiOperation({ summary: "Get active cart via checkout-service" })
  getCart(@Req() req: AuthenticatedRequest) {
    return this.proxyService.proxyRequest("checkout", "GET", "/cart", undefined, this.forwardHeaders(req), req.user);
  }

  @Delete("items/:itemId")
  @ApiOperation({ summary: "Remove cart item via checkout-service" })
  removeItem(@Param("itemId") itemId: string, @Req() req: AuthenticatedRequest) {
    return this.proxyService.proxyRequest(
      "checkout",
      "DELETE",
      `/cart/items/${itemId}`,
      undefined,
      this.forwardHeaders(req),
      req.user,
    );
  }

  private forwardHeaders(req: Request): Record<string, string> {
    const headers: Record<string, string> = {};
    const authorization = req.headers.authorization;

    if (authorization) {
      headers.Authorization = authorization;
    }

    const contentType = req.headers["content-type"];
    if (typeof contentType === "string") {
      headers["Content-Type"] = contentType;
    }

    return headers;
  }
}
