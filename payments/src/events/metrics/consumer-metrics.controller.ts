import { Controller, Get } from "@nestjs/common";
import { ConsumerMetrics, PaymentConsumerService } from "../payment-consumer/payment-consumer.service";

@Controller("consumer-metrics")
export class ConsumerMetricsController {
  constructor(private readonly paymentConsumerService: PaymentConsumerService) {}

  @Get()
  getMetrics(): ConsumerMetrics & {
    successRate: string;
    uptime: string;
    status: string;
  } {
    const metrics = this.paymentConsumerService.getMetrics();

    const successRate =
      metrics.totalProcessed > 0
        ? `${((metrics.totalSuccess / metrics.totalProcessed) * 100).toFixed(2)}%`
        : "0%";

    const uptime = this.calculateUptime(metrics.startedAt);

    return {
      ...metrics,
      successRate,
      uptime,
      status: "active",
    };
  }

  private calculateUptime(startedAt: Date): string {
    const diff = Date.now() - startedAt.getTime();

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}
