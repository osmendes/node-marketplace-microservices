import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import type { UserResponseDto } from "../users/dto/user-response.dto";
import { AuthService } from "./auth.service";
import { Public } from "./decorators/public.decorator";
import { LoginDto } from "./dto/login.dto";
import type { LoginResponseDto } from "./dto/login-response.dto";
import { RegisterDto } from "./dto/register.dto";

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
}
