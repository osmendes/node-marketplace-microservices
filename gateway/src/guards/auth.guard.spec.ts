import { describe, expect, it } from "vitest";
import { JwtAuthGuard } from "./auth.guard";

describe("JwtAuthGuard", () => {
  it("should be defined", () => {
    expect(new JwtAuthGuard()).toBeDefined();
  });
});
