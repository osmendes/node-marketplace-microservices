import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import type { FakePaymentGatewayResult } from "./fake-payment-gateway.interface";

const MIN_LATENCY_MS = 500;
const MAX_LATENCY_MS = 2000;
const AMOUNT_LIMIT = 10000;
const REJECTED_CENTS = 99;

@Injectable()
export class FakePaymentGatewayService {
  private readonly logger = new Logger(FakePaymentGatewayService.name);

  async process(amount: number): Promise<FakePaymentGatewayResult> {
    const normalizedAmount: number = this.normalizeAmount(amount);

    await this.simulateLatency();

    const transactionId: string = `txn_${randomUUID()}`;

    if (normalizedAmount > AMOUNT_LIMIT) {
      this.logger.log(`Payment rejected: amount ${normalizedAmount} exceeds limit`);
      return {
        approved: false,
        transactionId,
        rejectionReason: "Limite excedido",
      };
    }

    if (this.endsWithRejectedCents(normalizedAmount)) {
      this.logger.log(`Payment rejected: amount ${normalizedAmount} ends with .99`);
      return {
        approved: false,
        transactionId,
        rejectionReason: "Cartão recusado pela operadora",
      };
    }

    this.logger.log(`Payment approved: amount ${normalizedAmount}`);
    return {
      approved: true,
      transactionId,
    };
  }

  private normalizeAmount(amount: number | string): number {
    const parsed: number = typeof amount === "number" ? amount : Number(amount);
    if (Number.isNaN(parsed)) {
      throw new Error(`Invalid payment amount: ${String(amount)}`);
    }
    return parsed;
  }

  private endsWithRejectedCents(amount: number): boolean {
    const cents: number = Math.round((amount * 100) % 100);
    return cents === REJECTED_CENTS;
  }

  private async simulateLatency(): Promise<void> {
    const delayMs: number = Math.floor(Math.random() * (MAX_LATENCY_MS - MIN_LATENCY_MS + 1)) + MIN_LATENCY_MS;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }
}
