import { HttpService } from "@nestjs/axios";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { firstValueFrom } from "rxjs";
import { serviceConfig } from "../../config/gateway.config";

export interface UserSession {
  valid: boolean;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    status: string;
  } | null;
}

export interface ValidatedUser {
  userId: string;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly httpService: HttpService) {}

  async validateJwtToken(authorizationHeader: string): Promise<ValidatedUser> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<ValidatedUser>(`${serviceConfig.users.url}/auth/validate-token`, {
          headers: { Authorization: authorizationHeader },
          timeout: serviceConfig.users.timeout,
        }),
      );

      if (!data?.userId || !data.email || !data.role) {
        throw new UnauthorizedException("Invalid JWT token");
      }

      return data;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException("Invalid JWT token");
    }
  }

  async validadeSessionToken(sessionToken: string): Promise<UserSession> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<UserSession>(`${serviceConfig.users.url}/sessions/validate/${sessionToken}`, {
          timeout: serviceConfig.users.timeout,
        }),
      );

      return data;
    } catch {
      throw new UnauthorizedException("Invalid session token");
    }
  }
}
