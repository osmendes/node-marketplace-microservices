import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard } from "../guards/auth.guard";
import { ProxyService } from "./service/proxy.service";

interface GatewayUser {
  userId: string;
  email: string;
  role: string;
}

type AuthenticatedRequest = Request & { user: GatewayUser };

@ApiTags("Users")
@ApiBearerAuth("JWT-auth")
@UseGuards(JwtAuthGuard)
@Controller("users")
export class UsersProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Get("profile")
  @ApiOperation({ summary: "Get authenticated user profile via users-service" })
  getProfile(@Req() req: AuthenticatedRequest) {
    return this.proxyService.proxyRequest(
      "users",
      "GET",
      "/users/profile",
      undefined,
      this.forwardHeaders(req),
      req.user,
    );
  }

  @Get("sellers")
  @ApiOperation({ summary: "List active sellers via users-service" })
  getSellers(@Req() req: AuthenticatedRequest) {
    return this.proxyService.proxyRequest(
      "users",
      "GET",
      "/users/sellers",
      undefined,
      this.forwardHeaders(req),
      req.user,
    );
  }

  @Get(":id")
  @ApiOperation({ summary: "Get user by id via users-service" })
  getById(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.proxyService.proxyRequest(
      "users",
      "GET",
      `/users/${id}`,
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
