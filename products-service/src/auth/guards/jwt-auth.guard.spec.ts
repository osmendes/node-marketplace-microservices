import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { JwtAuthGuard } from "./jwt-auth.guard";

describe("JwtAuthGuard", () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;
  let superCanActivate: ReturnType<typeof vi.fn>;

  const createContext = (): ExecutionContext => {
    const handler = vi.fn();
    const klass = vi.fn();

    return {
      getHandler: () => handler,
      getClass: () => klass,
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
    superCanActivate = vi.fn().mockReturnValue(true);
    vi.spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), "canActivate").mockImplementation(superCanActivate);
  });

  it("allows access without calling AuthGuard when route is public", () => {
    const context = createContext();
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(true);

    const result = guard.canActivate(context);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    expect(result).toBe(true);
    expect(superCanActivate).not.toHaveBeenCalled();
  });

  it("delegates to AuthGuard when route is not public", () => {
    const context = createContext();
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);

    const result = guard.canActivate(context);

    expect(superCanActivate).toHaveBeenCalledWith(context);
    expect(result).toBe(true);
  });

  it("delegates to AuthGuard when isPublic metadata is missing", () => {
    const context = createContext();
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined);

    const result = guard.canActivate(context);

    expect(superCanActivate).toHaveBeenCalledWith(context);
    expect(result).toBe(true);
  });
});
