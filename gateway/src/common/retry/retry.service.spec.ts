import { describe, expect, it, vi } from "vitest";
import { RetryService } from "./retry.service";

describe("RetryService", () => {
  it("does not retry HTTP client errors (4xx)", async () => {
    const service = new RetryService();
    const clientError = { response: { status: 409, data: { message: "Conflict" } }, message: "Conflict" };
    const operation = vi.fn().mockRejectedValue(clientError);

    await expect(service.executeWithExponentialBackoff(operation, 3)).rejects.toBe(clientError);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
