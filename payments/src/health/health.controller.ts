import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Transport } from "@nestjs/microservices";
import { HealthCheck, HealthCheckService, MicroserviceHealthIndicator, TypeOrmHealthIndicator } from "@nestjs/terminus";

@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly microservice: MicroserviceHealthIndicator,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    const rabbitmqUrl = this.configService.get<string>("RABBITMQ_URL", "amqp://admin:admin@localhost:5672");

    return this.health.check([
      () => this.db.pingCheck("database"),
      () =>
        this.microservice.pingCheck<{
          transport?: number;
          options?: { urls: string[]; queue?: string };
        }>("rabbitmq", {
          transport: Transport.RMQ,
          options: {
            urls: [rabbitmqUrl],
          },
        }),
    ]);
  }
}
