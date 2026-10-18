import { Controller, Get, Param, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { AuthenticatedUser } from "../auth/strategies/jwt.strategy";
import type { UserResponseDto } from "./dto/user-response.dto";
import { UsersService } from "./users.service";

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@ApiTags("Users")
@ApiBearerAuth("JWT-auth")
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("profile")
  @ApiOperation({ summary: "Get authenticated user profile" })
  getProfile(@Req() req: AuthenticatedRequest): Promise<UserResponseDto> {
    return this.usersService.findProfile(req.user.id);
  }

  @Get("sellers")
  @ApiOperation({ summary: "List active sellers" })
  getSellers(): Promise<UserResponseDto[]> {
    return this.usersService.findSellers();
  }

  @Get(":id")
  @ApiOperation({ summary: "Get user by id" })
  getById(@Param("id") id: string): Promise<UserResponseDto> {
    return this.usersService.findById(id);
  }
}
