import { Controller, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../guards/auth.guard";
import { ProxyService } from "../proxy/service/proxy.service";

@ApiTags("Cart")
@ApiBearerAuth("JWT-auth")
@UseGuards(JwtAuthGuard)
@Controller("cart")
export class CartProxyController {
  constructor(private readonly proxyService: ProxyService) {}
}
