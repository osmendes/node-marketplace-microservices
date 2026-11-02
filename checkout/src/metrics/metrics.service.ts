import { Injectable, OnModuleInit } from "@nestjs/common";
import { Counter, collectDefaultMetrics, Histogram, Registry } from "prom-client";

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry: Registry;
  readonly httpRequestsTotal: Counter<"method" | "route" | "status_code">;
  readonly httpRequestDurationSeconds: Histogram<"method" | "route" | "status_code">;
  readonly ordersCreatedTotal: Counter;
  readonly rabbitmqMessagesPublishedTotal: Counter<"queue">;

  constructor() {
    this.registry = new Registry();

    this.httpRequestsTotal = new Counter({
      name: "http_requests_total",
      help: "Total number of HTTP requests",
      labelNames: ["method", "route", "status_code"],
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new Histogram({
      name: "http_request_duration_seconds",
      help: "Duration of HTTP requests in seconds",
      labelNames: ["method", "route", "status_code"],
      registers: [this.registry],
    });

    this.ordersCreatedTotal = new Counter({
      name: "orders_created_total",
      help: "Total number of orders created",
      registers: [this.registry],
    });

    this.rabbitmqMessagesPublishedTotal = new Counter({
      name: "rabbitmq_messages_published_total",
      help: "Total number of RabbitMQ messages published successfully",
      labelNames: ["queue"],
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
