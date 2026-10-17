import { Controller, Get, Param, Req } from "@nestjs/common";
import type { Request } from "express";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import type { UserResponseDto } from "./dto/user-response.dto";
import { UsersService } from "./users.service";

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("profile")
  getProfile(@Req() req: AuthenticatedRequest): Promise<UserResponseDto> {
    return this.usersService.findProfile(req.user.id);
  }

  @Get("sellers")
  getSellers(): Promise<UserResponseDto[]> {
    return this.usersService.findSellers();
  }

  @Get(":id")
  getById(@Param("id") id: string): Promise<UserResponseDto> {
    return this.usersService.findById(id);
  }
}
