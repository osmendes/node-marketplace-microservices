import type { UserResponseDto } from "../dto/user-response.dto";
import type { User } from "../entities/user.entity";

export function toPublicUser(user: User): UserResponseDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
