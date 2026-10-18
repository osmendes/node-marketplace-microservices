import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import type { UserResponseDto } from "../users/dto/user-response.dto";
import { AuthService } from "./auth.service";
import { Public } from "./decorators/public.decorator";
import { LoginDto } from "./dto/login.dto";
import type { LoginResponseDto } from "./dto/login-response.dto";
import { RegisterDto } from "./dto/register.dto";
import type { ValidateTokenResponseDto } from "./dto/validate-token-response.dto";
import type { AuthenticatedUser } from "./strategies/jwt.strategy";

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto): Promise<UserResponseDto> {
    return this.authService.register(dto);
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
  }

  @Get("validate-token")
  @HttpCode(HttpStatus.OK)
  validateToken(@Req() req: AuthenticatedRequest): ValidateTokenResponseDto {
    return {
      userId: req.user.id,
      email: req.user.email,
      role: req.user.role,
    };
  }
}
