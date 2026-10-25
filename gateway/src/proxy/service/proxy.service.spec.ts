import { HttpService } from "@nestjs/axios";
import { HttpException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { of, throwError } from "rxjs";
import { CircuitBreakerService } from "src/common/circuit-breaker/circuit-breaker.service";
import { CacheFallbackService } from "src/common/fallback/cache.fallback";
import { DefaultFallbackService } from "src/common/fallback/default.fallback";
import { RetryService } from "src/common/retry/retry.service";
import { TimeoutService } from "src/common/timeout/timeout.service";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProxyService } from "./proxy.service";

describe("ProxyService", () => {
  let service: ProxyService;
  let httpService: { request: ReturnType<typeof vi.fn> };
  let cacheFallbackService: { setCachedData: ReturnType<typeof vi.fn>; createCacheFallback: ReturnType<typeof vi.fn> };
  let defaultFallbackService: {
    createErrorFallback: ReturnType<typeof vi.fn>;
    createDefaultFallback: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    httpService = {
      request: vi.fn(),
    };

    cacheFallbackService = {
      setCachedData: vi.fn(),
      createCacheFallback: vi.fn(),
    };

    defaultFallbackService = {
      createErrorFallback: vi.fn(() => async () => {
        throw new Error("fallback");
      }),
      createDefaultFallback: vi.fn(() => async () => ({ unavailable: true })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProxyService,
        { provide: HttpService, useValue: httpService },
        {
          provide: CircuitBreakerService,
          useValue: {
            executeWithCircuitBreaker: vi.fn(async (operation: () => Promise<unknown>) => operation()),
          },
        },
        {
          provide: RetryService,
          useValue: {
            executeWithExponentialBackoff: vi.fn(async (operation: () => Promise<unknown>) => operation()),
          },
        },
        {
          provide: TimeoutService,
          useValue: {
            executeWithCustomTimeout: vi.fn(async (operation: () => Promise<unknown>) => operation()),
          },
        },
        { provide: CacheFallbackService, useValue: cacheFallbackService },
        { provide: DefaultFallbackService, useValue: defaultFallbackService },
      ],
    }).compile();

    service = module.get<ProxyService>(ProxyService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("returns upstream data on success and caches GET responses", async () => {
    const payload = [{ id: "1", name: "Product" }];
    httpService.request.mockReturnValue(of({ data: payload }));

    await expect(service.proxyRequest("products", "GET", "/products")).resolves.toEqual(payload);

    expect(httpService.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "get",
        url: expect.stringContaining("/products"),
      }),
    );
    expect(cacheFallbackService.setCachedData).toHaveBeenCalledWith("products-/products", payload);
  });

  it("rethrows upstream 4xx as HttpException preserving status and body", async () => {
    const body = { statusCode: 409, message: "Email is already registered", error: "Conflict" };
    httpService.request.mockReturnValue(
      throwError(() => ({
        response: { status: 409, data: body },
        message: "Request failed with status code 409",
      })),
    );

    const error = await service
      .proxyRequest("users", "POST", "/auth/register", { email: "a@example.com" })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(409);
    expect((error as HttpException).getResponse()).toEqual(body);
  });
});
