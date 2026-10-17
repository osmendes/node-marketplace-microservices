import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import type { UserResponseDto } from "./dto/user-response.dto";
import { User } from "./entities/user.entity";
import { UserRole } from "./enums/user-role.enum";
import { UserStatus } from "./enums/user-status.enum";
import { toPublicUser } from "./mappers/to-public-user";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findProfile(userId: string): Promise<UserResponseDto> {
    return this.findById(userId);
  }

  async findSellers(): Promise<UserResponseDto[]> {
    const sellers = await this.usersRepository.find({
      where: {
        role: UserRole.SELLER,
        status: UserStatus.ACTIVE,
      },
    });

    return sellers.map(toPublicUser);
  }

  async findById(id: string): Promise<UserResponseDto> {
    const user = await this.usersRepository.findOne({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return toPublicUser(user);
  }
}
