import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProxyModule } from "../proxy/proxy.module";
import { CartProxyController } from "./cart-proxy.controller";
import { OrdersProxyController } from "./orders-proxy.controller";

@Module({
  imports: [ProxyModule, AuthModule],
  controllers: [CartProxyController, OrdersProxyController],
})
export class CheckoutModule {}
