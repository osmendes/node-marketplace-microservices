import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { ProductsClientService } from "./products-client.service";

@Module({
  imports: [HttpModule],
  providers: [ProductsClientService],
  exports: [ProductsClientService],
})
export class ProductsClientModule {}
