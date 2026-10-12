import { IsEmail, IsEnum, IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";
import { UserRole } from "../../users/enums/user-role.enum";

export class RegisterDto {
  @IsEmail({}, { message: "email must be a valid email address" })
  @IsNotEmpty({ message: "email is required" })
  email: string;

  @IsString()
  @IsNotEmpty({ message: "password is required" })
  @MinLength(6, { message: "password must be at least 6 characters" })
  password: string;

  @IsString()
  @IsNotEmpty({ message: "firstName is required" })
  @MaxLength(100, { message: "firstName must be at most 100 characters" })
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: "lastName is required" })
  @MaxLength(100, { message: "lastName must be at most 100 characters" })
  lastName: string;

  @IsEnum(UserRole, { message: "role must be either seller or buyer" })
  @IsNotEmpty({ message: "role is required" })
  role: UserRole;
}
