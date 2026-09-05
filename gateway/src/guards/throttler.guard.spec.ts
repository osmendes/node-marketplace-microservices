import { describe, expect, it } from "vitest";
import { CustomThrottlerGuard } from "./throttler.guard";

describe("CustomThrottlerGuard", () => {
  it("should be defined", () => {
    expect(new CustomThrottlerGuard()).toBeDefined();
  });
});
