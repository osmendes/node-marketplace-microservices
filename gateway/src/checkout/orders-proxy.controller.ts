import { Controller, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../guards/auth.guard";
import { ProxyService } from "../proxy/service/proxy.service";

@ApiTags("Orders")
@ApiBearerAuth("JWT-auth")
@UseGuards(JwtAuthGuard)
@Controller()
export class OrdersProxyController {
  constructor(private readonly proxyService: ProxyService) {}
}
