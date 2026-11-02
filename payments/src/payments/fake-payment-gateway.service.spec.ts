import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakePaymentGatewayService } from "./fake-payment-gateway.service";

const TRANSACTION_ID_PREFIX = /^txn_/;

describe("FakePaymentGatewayService", () => {
  let service: FakePaymentGatewayService;

  beforeEach(() => {
    service = new FakePaymentGatewayService();
    vi.spyOn(service as unknown as { simulateLatency: () => Promise<void> }, "simulateLatency").mockResolvedValue(
      undefined,
    );
  });

  it("rejects amounts greater than 10000 with Limite excedido", async () => {
    const result = await service.process(10000.01);

    expect(result.approved).toBe(false);
    expect(result.rejectionReason).toBe("Limite excedido");
    expect(result.transactionId).toMatch(TRANSACTION_ID_PREFIX);
  });

  it("rejects amounts ending in .99 with Cartão recusado pela operadora", async () => {
    const result = await service.process(199.99);

    expect(result.approved).toBe(false);
    expect(result.rejectionReason).toBe("Cartão recusado pela operadora");
    expect(result.transactionId).toMatch(TRANSACTION_ID_PREFIX);
  });

  it("approves other amounts without rejectionReason", async () => {
    const result = await service.process(150.5);

    expect(result.approved).toBe(true);
    expect(result.rejectionReason).toBeUndefined();
    expect(result.transactionId).toMatch(TRANSACTION_ID_PREFIX);
  });

  it("evaluates limit before .99 suffix", async () => {
    const result = await service.process(10000.99);

    expect(result.approved).toBe(false);
    expect(result.rejectionReason).toBe("Limite excedido");
  });

  it("approves amount equal to 10000", async () => {
    const result = await service.process(10000);

    expect(result.approved).toBe(true);
    expect(result.rejectionReason).toBeUndefined();
  });
});
