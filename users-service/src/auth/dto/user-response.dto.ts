import { UserRole } from "../../users/enums/user-role.enum";
import { UserStatus } from "../../users/enums/user-status.enum";

export class UserResponseDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}
