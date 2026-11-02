import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
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

@ApiTags("Payments")
@ApiBearerAuth("JWT-auth")
@UseGuards(JwtAuthGuard)
@Controller("payments")
export class PaymentsProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Get(":orderId")
  @ApiOperation({ summary: "Get payment by orderId via payments-service" })
  getPaymentByOrderId(@Param("orderId") orderId: string, @Req() req: AuthenticatedRequest) {
    return this.proxyService.proxyRequest(
      "payments",
      "GET",
      `/payments/${orderId}`,
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
