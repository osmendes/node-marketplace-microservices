import type { UserResponseDto } from "../../users/dto/user-response.dto";

export class LoginResponseDto {
  user: UserResponseDto;
  token: string;
}
