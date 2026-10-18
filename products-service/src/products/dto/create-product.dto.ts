import { Type } from "class-transformer";
import { IsInt, IsNotEmpty, IsNumber, IsString, MaxLength, Min } from "class-validator";

export class CreateProductDto {
  @IsString({ message: "name must be a string" })
  @IsNotEmpty({ message: "name is required" })
  @MaxLength(255, { message: "name must be at most 255 characters" })
  name: string;

  @IsString({ message: "description must be a string" })
  @IsNotEmpty({ message: "description is required" })
  description: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "price must be a number with at most 2 decimal places" })
  @Min(0.01, { message: "price must be at least 0.01" })
  price: number;

  @Type(() => Number)
  @IsInt({ message: "stock must be an integer" })
  @Min(0, { message: "stock must be at least 0" })
  stock: number;
}
