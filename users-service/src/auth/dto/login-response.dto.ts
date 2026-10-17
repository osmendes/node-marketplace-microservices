import type { UserResponseDto } from "./user-response.dto";

export class LoginResponseDto {
  user: UserResponseDto;
  token: string;
}
