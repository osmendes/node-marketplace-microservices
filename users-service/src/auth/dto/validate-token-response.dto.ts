import { ApiProperty } from "@nestjs/swagger";
import { UserRole } from "../../users/enums/user-role.enum";

export class ValidateTokenResponseDto {
  @ApiProperty({ format: "uuid" })
  userId: string;

  @ApiProperty({ example: "user@example.com" })
  email: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;
}
