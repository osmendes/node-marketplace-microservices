import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, type TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import * as bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { User } from "../users/entities/user.entity";
import { UserRole } from "../users/enums/user-role.enum";
import { UserStatus } from "../users/enums/user-status.enum";
import { AuthService } from "./auth.service";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";

describe("AuthService", () => {
  let authService: AuthService;
  let findOne: ReturnType<typeof vi.fn>;
  let create: ReturnType<typeof vi.fn>;
  let save: ReturnType<typeof vi.fn>;
  let signAsync: ReturnType<typeof vi.fn>;

  const registerDto: RegisterDto = {
    email: "buyer@example.com",
    password: "secret1",
    firstName: "Ada",
    lastName: "Lovelace",
    role: UserRole.BUYER,
  };

  const loginDto: LoginDto = {
    email: "buyer@example.com",
    password: "secret1",
  };

  const activeUser: User = {
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

  beforeEach(async () => {
    findOne = vi.fn();
    create = vi.fn();
    save = vi.fn();
    signAsync = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: { findOne, create, save },
        },
        {
          provide: JwtService,
          useValue: { signAsync },
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

    create.mockImplementation((data: Partial<User>) => ({ ...createdUser, ...data }));
    save.mockImplementation(async (user: User) => ({
      ...activeUser,
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
      id: activeUser.id,
      email: activeUser.email,
      firstName: activeUser.firstName,
      lastName: activeUser.lastName,
      role: activeUser.role,
      status: UserStatus.ACTIVE,
      createdAt: activeUser.createdAt,
      updatedAt: activeUser.updatedAt,
    });
    expect(result).not.toHaveProperty("password");
  });

  it("throws ConflictException when email is already registered", async () => {
    findOne.mockResolvedValue({ id: "existing-id", email: registerDto.email });

    await expect(authService.register(registerDto)).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("logs in an active user and returns public user with jwt token", async () => {
    const hashedPassword = await bcrypt.hash(loginDto.password, 10);
    findOne.mockResolvedValue({ ...activeUser, password: hashedPassword });
    signAsync.mockResolvedValue("signed.jwt.token");

    const result = await authService.login(loginDto);

    expect(findOne).toHaveBeenCalledWith({ where: { email: loginDto.email } });
    expect(signAsync).toHaveBeenCalledWith({
      sub: activeUser.id,
      email: activeUser.email,
      role: activeUser.role,
    });
    expect(result.token).toBe("signed.jwt.token");
    expect(result.user).toEqual({
      id: activeUser.id,
      email: activeUser.email,
      firstName: activeUser.firstName,
      lastName: activeUser.lastName,
      role: activeUser.role,
      status: UserStatus.ACTIVE,
      createdAt: activeUser.createdAt,
      updatedAt: activeUser.updatedAt,
    });
    expect(result.user).not.toHaveProperty("password");
  });

  it("throws UnauthorizedException with generic message when email does not exist", async () => {
    findOne.mockResolvedValue(null);

    await expect(authService.login(loginDto)).rejects.toMatchObject({
      response: expect.objectContaining({
        message: "Credenciais inválidas",
        statusCode: 401,
      }),
    });
    await expect(authService.login(loginDto)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(signAsync).not.toHaveBeenCalled();
  });

  it("throws UnauthorizedException with generic message when password is wrong", async () => {
    const hashedPassword = await bcrypt.hash("another-password", 10);
    findOne.mockResolvedValue({ ...activeUser, password: hashedPassword });

    await expect(authService.login(loginDto)).rejects.toMatchObject({
      response: expect.objectContaining({
        message: "Credenciais inválidas",
        statusCode: 401,
      }),
    });
    expect(signAsync).not.toHaveBeenCalled();
  });

  it("throws UnauthorizedException when account is inactive", async () => {
    const hashedPassword = await bcrypt.hash(loginDto.password, 10);
    findOne.mockResolvedValue({
      ...activeUser,
      password: hashedPassword,
      status: UserStatus.INACTIVE,
    });

    await expect(authService.login(loginDto)).rejects.toMatchObject({
      response: expect.objectContaining({
        message: "Conta inativa",
        statusCode: 401,
      }),
    });
    expect(signAsync).not.toHaveBeenCalled();
  });
});
