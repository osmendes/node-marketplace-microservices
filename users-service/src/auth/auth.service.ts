import { ConflictException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcryptjs";
import type { Repository } from "typeorm";
import { User } from "../users/entities/user.entity";
import { UserStatus } from "../users/enums/user-status.enum";
import type { RegisterDto } from "./dto/register.dto";
import type { UserResponseDto } from "./dto/user-response.dto";

const BCRYPT_SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async register(dto: RegisterDto): Promise<UserResponseDto> {
    const existingUser = await this.usersRepository.findOne({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException("Email is already registered");
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    const user = this.usersRepository.create({
      email: dto.email,
      password: hashedPassword,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      status: UserStatus.ACTIVE,
    });

    const savedUser = await this.usersRepository.save(user);

    return this.toPublicUser(savedUser);
  }

  private toPublicUser(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
