import { NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { User } from "./entities/user.entity";
import { UserRole } from "./enums/user-role.enum";
import { UserStatus } from "./enums/user-status.enum";
import { UsersService } from "./users.service";

describe("UsersService", () => {
  let usersService: UsersService;
  let findOne: ReturnType<typeof vi.fn>;
  let find: ReturnType<typeof vi.fn>;

  const activeBuyer: User = {
    id: "11111111-1111-1111-1111-111111111111",
    email: "buyer@example.com",
    password: "hashed-password",
    firstName: "Ada",
    lastName: "Lovelace",
    role: UserRole.BUYER,
    status: UserStatus.ACTIVE,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  const activeSeller: User = {
    id: "22222222-2222-2222-2222-222222222222",
    email: "seller@example.com",
    password: "hashed-password",
    firstName: "Grace",
    lastName: "Hopper",
    role: UserRole.SELLER,
    status: UserStatus.ACTIVE,
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  };

  const inactiveSeller: User = {
    id: "33333333-3333-3333-3333-333333333333",
    email: "inactive-seller@example.com",
    password: "hashed-password",
    firstName: "Alan",
    lastName: "Turing",
    role: UserRole.SELLER,
    status: UserStatus.INACTIVE,
    createdAt: new Date("2026-01-03T00:00:00.000Z"),
    updatedAt: new Date("2026-01-03T00:00:00.000Z"),
  };

  beforeEach(async () => {
    findOne = vi.fn();
    find = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne,
            find,
          },
        },
      ],
    }).compile();

    usersService = module.get(UsersService);
  });

  it("findProfile returns public user without password", async () => {
    findOne.mockResolvedValue(activeBuyer);

    const result = await usersService.findProfile(activeBuyer.id);

    expect(findOne).toHaveBeenCalledWith({ where: { id: activeBuyer.id } });
    expect(result).toMatchObject({
      id: activeBuyer.id,
      email: activeBuyer.email,
      firstName: activeBuyer.firstName,
      lastName: activeBuyer.lastName,
      role: activeBuyer.role,
      status: activeBuyer.status,
    });
    expect(result).not.toHaveProperty("password");
  });

  it("findProfile throws NotFoundException when user does not exist", async () => {
    findOne.mockResolvedValue(null);

    await expect(usersService.findProfile(activeBuyer.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("findById returns public user without password", async () => {
    findOne.mockResolvedValue(activeSeller);

    const result = await usersService.findById(activeSeller.id);

    expect(findOne).toHaveBeenCalledWith({ where: { id: activeSeller.id } });
    expect(result).toMatchObject({
      id: activeSeller.id,
      email: activeSeller.email,
      role: UserRole.SELLER,
      status: UserStatus.ACTIVE,
    });
    expect(result).not.toHaveProperty("password");
  });

  it("findById throws NotFoundException when user does not exist", async () => {
    findOne.mockResolvedValue(null);

    await expect(usersService.findById("00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("findSellers returns only active sellers without password", async () => {
    find.mockResolvedValue([activeSeller]);

    const result = await usersService.findSellers();

    expect(find).toHaveBeenCalledWith({
      where: {
        role: UserRole.SELLER,
        status: UserStatus.ACTIVE,
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: activeSeller.id,
      email: activeSeller.email,
      role: UserRole.SELLER,
      status: UserStatus.ACTIVE,
    });
    expect(result[0]).not.toHaveProperty("password");
    expect(result.some((user) => user.id === inactiveSeller.id)).toBe(false);
    expect(result.some((user) => user.id === activeBuyer.id)).toBe(false);
  });

  it("findSellers returns empty array when there are no active sellers", async () => {
    find.mockResolvedValue([]);

    const result = await usersService.findSellers();

    expect(result).toEqual([]);
  });
});
