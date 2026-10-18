import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JwtStrategy } from "./jwt.strategy";

describe("JwtStrategy", () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    const configService = {
      get: vi.fn().mockReturnValue("test-jwt-secret"),
    } as unknown as ConfigService;

    strategy = new JwtStrategy(configService);
  });

  it("returns authenticated user with id, email and role from payload", () => {
    const result = strategy.validate({
      sub: "11111111-1111-1111-1111-111111111111",
      email: "buyer@example.com",
      role: "buyer",
    });

    expect(result).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      email: "buyer@example.com",
      role: "buyer",
    });
  });

  it("throws UnauthorizedException when payload is missing required claims", () => {
    expect(() =>
      strategy.validate({
        sub: "",
        email: "buyer@example.com",
        role: "buyer",
      }),
    ).toThrow(UnauthorizedException);

    expect(() =>
      strategy.validate({
        sub: "11111111-1111-1111-1111-111111111111",
        email: "",
        role: "buyer",
      }),
    ).toThrow(UnauthorizedException);

    expect(() =>
      strategy.validate({
        sub: "11111111-1111-1111-1111-111111111111",
        email: "buyer@example.com",
        role: undefined as unknown as "buyer",
      }),
    ).toThrow(UnauthorizedException);
  });

  it("throws when JWT_SECRET is not defined", () => {
    const configService = {
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    expect(() => new JwtStrategy(configService)).toThrow("JWT_SECRET is not defined");
  });
});
