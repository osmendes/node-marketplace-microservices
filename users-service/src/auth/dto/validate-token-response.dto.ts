import type { UserRole } from "../../users/enums/user-role.enum";

export class ValidateTokenResponseDto {
  userId: string;
  email: string;
  role: UserRole;
}
