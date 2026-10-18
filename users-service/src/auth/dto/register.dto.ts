import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsEnum, IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";
import { UserRole } from "../../users/enums/user-role.enum";

export class RegisterDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail({}, { message: "email must be a valid email address" })
  @IsNotEmpty({ message: "email is required" })
  email: string;

  @ApiProperty({ example: "secret1", minLength: 6 })
  @IsString()
  @IsNotEmpty({ message: "password is required" })
  @MinLength(6, { message: "password must be at least 6 characters" })
  password: string;

  @ApiProperty({ example: "Ada" })
  @IsString()
  @IsNotEmpty({ message: "firstName is required" })
  @MaxLength(100, { message: "firstName must be at most 100 characters" })
  firstName: string;

  @ApiProperty({ example: "Lovelace" })
  @IsString()
  @IsNotEmpty({ message: "lastName is required" })
  @MaxLength(100, { message: "lastName must be at most 100 characters" })
  lastName: string;

  @ApiProperty({ enum: UserRole, example: UserRole.BUYER })
  @IsEnum(UserRole, { message: "role must be either seller or buyer" })
  @IsNotEmpty({ message: "role is required" })
  role: UserRole;
}
