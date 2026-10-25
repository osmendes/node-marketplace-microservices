import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { Public } from "../auth/decorators/public.decorator";
import { LoginDto } from "../auth/dtos/login.dto";
import { RegisterDto } from "../auth/dtos/register.dto";
import { JwtAuthGuard } from "../guards/auth.guard";
import { ProxyService } from "./service/proxy.service";

interface GatewayUser {
  userId: string;
  email: string;
  role: string;
}

type AuthenticatedRequest = Request & { user: GatewayUser };

@ApiTags("Authentication")
@ApiBearerAuth("JWT-auth")
@UseGuards(JwtAuthGuard)
@Controller("auth")
export class AuthProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Public()
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "User registration via users-service" })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Registration successful" })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid registration data" })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: "Email already exists" })
  @Throttle({ medium: { limit: 3, ttl: 60000 } })
  register(@Body() body: RegisterDto, @Req() req: Request) {
    return this.proxyService.proxyRequest("users", "POST", "/auth/register", body, this.forwardHeaders(req));
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "User login via users-service" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Login realizado com sucesso",
    schema: {
      type: "object",
      properties: {
        user: { type: "object" },
        token: { type: "string" },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: "Invalid credentials" })
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  login(@Body() body: LoginDto, @Req() req: Request) {
    return this.proxyService.proxyRequest("users", "POST", "/auth/login", body, this.forwardHeaders(req));
  }

  @Get("validate-token")
  @ApiOperation({ summary: "Validate JWT via users-service" })
  validateToken(@Req() req: AuthenticatedRequest) {
    return this.proxyService.proxyRequest(
      "users",
      "GET",
      "/auth/validate-token",
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
