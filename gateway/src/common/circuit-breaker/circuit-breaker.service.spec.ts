import { describe, expect, it, vi } from "vitest";
import { CircuitBreakerStateEnum } from "./circuit-breaker.interface";
import { CircuitBreakerService } from "./circuit-breaker.service";

describe("CircuitBreakerService", () => {
  it("does not count HTTP client errors (4xx) as circuit failures", async () => {
    const service = new CircuitBreakerService();
    const clientError = { response: { status: 401, data: { message: "Unauthorized" } }, message: "Unauthorized" };
    const operation = vi.fn().mockRejectedValue(clientError);
    const fallback = vi.fn();

    for (let i = 0; i < 5; i++) {
      await expect(
        service.executeWithCircuitBreaker(operation, "proxy-users", { failureThreshold: 3 }, fallback),
      ).rejects.toBe(clientError);
    }

    const circuit = service.getCircuitState("proxy-users");
    expect(circuit?.state).toBe(CircuitBreakerStateEnum.CLOSED);
    expect(circuit?.failureCount).toBe(0);
    expect(fallback).not.toHaveBeenCalled();
  });
});
