import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Transport } from "@nestjs/microservices";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { HealthCheck, HealthCheckService, MicroserviceHealthIndicator, TypeOrmHealthIndicator } from "@nestjs/terminus";
import { Public } from "../auth/decorators/public.decorator";

@ApiTags("Health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly microservice: MicroserviceHealthIndicator,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: "Service health check (PostgreSQL + RabbitMQ)" })
  check() {
    const rabbitmqUrl = this.configService.get<string>("RABBITMQ_URL", "amqp://admin:admin@localhost:5672");

    return this.health.check([
      () => this.db.pingCheck("database"),
      () =>
        this.microservice.pingCheck("rabbitmq", {
          transport: Transport.RMQ,
          options: { urls: [rabbitmqUrl] },
        }),
    ]);
  }
}
