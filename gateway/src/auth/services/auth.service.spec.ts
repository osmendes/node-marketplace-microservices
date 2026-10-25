import { HttpService } from "@nestjs/axios";
import { UnauthorizedException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { of, throwError } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  let service: AuthService;
  let httpService: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    httpService = {
      get: vi.fn(),
      post: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: HttpService,
          useValue: httpService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("validateJwtToken calls users-service /auth/validate-token with Authorization", async () => {
    const validated = { userId: "uuid", email: "a@example.com", role: "buyer" };
    httpService.get.mockReturnValue(of({ data: validated }));

    await expect(service.validateJwtToken("Bearer token")).resolves.toEqual(validated);
    expect(httpService.get).toHaveBeenCalledWith(
      "http://localhost:3000/auth/validate-token",
      expect.objectContaining({
        headers: { Authorization: "Bearer token" },
        timeout: 10000,
      }),
    );
  });

  it("validateJwtToken throws UnauthorizedException on failure", async () => {
    httpService.get.mockReturnValue(throwError(() => new Error("boom")));

    await expect(service.validateJwtToken("Bearer bad")).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
