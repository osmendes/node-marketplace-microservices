import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail({}, { message: "email must be a valid email address" })
  @IsNotEmpty({ message: "email is required" })
  email: string;

  @ApiProperty({ example: "secret1", minLength: 6 })
  @IsString()
  @IsNotEmpty({ message: "password is required" })
  @MinLength(6, { message: "password must be at least 6 characters" })
  password: string;
}
