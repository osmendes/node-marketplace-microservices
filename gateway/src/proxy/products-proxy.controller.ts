import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { Public } from "../auth/decorators/public.decorator";
import { JwtAuthGuard } from "../guards/auth.guard";
import { ProxyService } from "./service/proxy.service";

interface GatewayUser {
  userId: string;
  email: string;
  role: string;
}

type AuthenticatedRequest = Request & { user: GatewayUser };

@ApiTags("Products")
@ApiBearerAuth("JWT-auth")
@UseGuards(JwtAuthGuard)
@Controller("products")
export class ProductsProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "List active products via products-service" })
  findAll(@Req() req: Request) {
    return this.proxyService.proxyRequest("products", "GET", "/products", undefined, this.forwardHeaders(req));
  }

  @Public()
  @Get("seller/:sellerId")
  @ApiOperation({ summary: "List active products by seller via products-service" })
  findBySeller(@Param("sellerId") sellerId: string, @Req() req: Request) {
    return this.proxyService.proxyRequest(
      "products",
      "GET",
      `/products/seller/${sellerId}`,
      undefined,
      this.forwardHeaders(req),
    );
  }

  @Public()
  @Get(":id")
  @ApiOperation({ summary: "Get product by id via products-service" })
  findOne(@Param("id") id: string, @Req() req: Request) {
    return this.proxyService.proxyRequest("products", "GET", `/products/${id}`, undefined, this.forwardHeaders(req));
  }

  @Post()
  @ApiOperation({ summary: "Create product via products-service (seller only)" })
  create(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    return this.proxyService.proxyRequest("products", "POST", "/products", body, this.forwardHeaders(req), req.user);
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
