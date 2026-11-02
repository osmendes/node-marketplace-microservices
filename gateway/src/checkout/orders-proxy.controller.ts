import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from "@nestjs/common";
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

@ApiTags("Orders")
@ApiBearerAuth("JWT-auth")
@UseGuards(JwtAuthGuard)
@Controller()
export class OrdersProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Post("cart/checkout")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Finalize cart into order via checkout-service" })
  checkout(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    return this.proxyService.proxyRequest(
      "checkout",
      "POST",
      "/cart/checkout",
      body,
      this.forwardHeaders(req),
      req.user,
    );
  }

  @Get("orders")
  @ApiOperation({ summary: "List orders via checkout-service" })
  listOrders(@Req() req: AuthenticatedRequest) {
    return this.proxyService.proxyRequest("checkout", "GET", "/orders", undefined, this.forwardHeaders(req), req.user);
  }

  @Get("orders/:id")
  @ApiOperation({ summary: "Get order by id via checkout-service" })
  getOrder(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.proxyService.proxyRequest(
      "checkout",
      "GET",
      `/orders/${id}`,
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
