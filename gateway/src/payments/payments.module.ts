import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProxyModule } from "../proxy/proxy.module";
import { PaymentsProxyController } from "./payments-proxy.controller";

@Module({
  imports: [ProxyModule, AuthModule],
  controllers: [PaymentsProxyController],
})
export class PaymentsModule {}
