import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsEnum, IsNotEmpty, IsString, MinLength } from "class-validator";

enum UserRole {
  SELLER = "seller",
  BUYER = "buyer",
}

export class RegisterDto {
  @ApiProperty({ description: "Email do usuário", example: "user@example.com" })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: "Senha do usuário", example: "password123", minLength: 6 })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({ description: "Primeiro nome", example: "João" })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ description: "Sobrenome", example: "Silva" })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ description: "Role do usuário", enum: UserRole, example: UserRole.BUYER })
  @IsEnum(UserRole)
  @IsNotEmpty()
  role: UserRole;
}
