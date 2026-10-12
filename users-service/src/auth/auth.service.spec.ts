import { ConflictException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import * as bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { User } from "../users/entities/user.entity";
import { UserRole } from "../users/enums/user-role.enum";
import { UserStatus } from "../users/enums/user-status.enum";
import { AuthService } from "./auth.service";
import type { RegisterDto } from "./dto/register.dto";

describe("AuthService", () => {
  let authService: AuthService;
  let findOne: ReturnType<typeof vi.fn>;
  let create: ReturnType<typeof vi.fn>;
  let save: ReturnType<typeof vi.fn>;

  const registerDto: RegisterDto = {
    email: "buyer@example.com",
    password: "secret1",
    firstName: "Ada",
    lastName: "Lovelace",
    role: UserRole.BUYER,
  };

  beforeEach(async () => {
    findOne = vi.fn();
    create = vi.fn();
    save = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: { findOne, create, save },
        },
      ],
    }).compile();

    authService = module.get(AuthService);
  });

  it("registers a user with hashed password, active status and no password in response", async () => {
    findOne.mockResolvedValue(null);

    const createdUser = {
      ...registerDto,
      password: "plain-should-be-replaced",
      status: UserStatus.ACTIVE,
    };

    const savedUser: User = {
      id: "11111111-1111-1111-1111-111111111111",
      email: registerDto.email,
      password: "hashed-password",
      firstName: registerDto.firstName,
      lastName: registerDto.lastName,
      role: registerDto.role,
      status: UserStatus.ACTIVE,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    create.mockImplementation((data: Partial<User>) => ({ ...createdUser, ...data }));
    save.mockImplementation(async (user: User) => ({
      ...savedUser,
      password: user.password,
    }));

    const result = await authService.register(registerDto);

    expect(findOne).toHaveBeenCalledWith({ where: { email: registerDto.email } });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: registerDto.email,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        role: registerDto.role,
        status: UserStatus.ACTIVE,
      }),
    );

    const persistedPassword = (create.mock.calls[0][0] as User).password;
    expect(persistedPassword).not.toBe(registerDto.password);
    expect(await bcrypt.compare(registerDto.password, persistedPassword)).toBe(true);
    expect(bcrypt.getRounds(persistedPassword)).toBe(10);

    expect(result).toEqual({
      id: savedUser.id,
      email: savedUser.email,
      firstName: savedUser.firstName,
      lastName: savedUser.lastName,
      role: savedUser.role,
      status: UserStatus.ACTIVE,
      createdAt: savedUser.createdAt,
      updatedAt: savedUser.updatedAt,
    });
    expect(result).not.toHaveProperty("password");
  });

  it("throws ConflictException when email is already registered", async () => {
    findOne.mockResolvedValue({ id: "existing-id", email: registerDto.email });

    await expect(authService.register(registerDto)).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
