import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail({}, { message: "email must be a valid email address" })
  @IsNotEmpty({ message: "email is required" })
  email: string;

  @IsString()
  @IsNotEmpty({ message: "password is required" })
  @MinLength(6, { message: "password must be at least 6 characters" })
  password: string;
}
