import { describe, expect, it } from "vitest";
import { SessionGuard } from "./session.guard";

describe("SessionGuard", () => {
  it("should be defined", () => {
    expect(new SessionGuard()).toBeDefined();
  });
});
