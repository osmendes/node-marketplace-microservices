import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsUUID, Min } from "class-validator";

export class AddCartItemDto {
  @ApiProperty({
    description: "Product UUID from products-service",
    format: "uuid",
    example: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  })
  @IsUUID("4", { message: "productId must be a valid UUID" })
  productId: string;

  @ApiProperty({
    description: "Quantity to add to the cart",
    minimum: 1,
    example: 1,
  })
  @Type(() => Number)
  @IsInt({ message: "quantity must be an integer" })
  @Min(1, { message: "quantity must be at least 1" })
  quantity: number;
}
