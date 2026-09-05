import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../auth/services/auth.service";

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const sessionToken = request.headers["x-session-token"];

    if (!sessionToken) {
      throw new UnauthorizedException("Session token required");
    }

    try {
      const session = await this.authService.validadeSessionToken(sessionToken);

      if (!session.valid || !session.user) {
        throw new UnauthorizedException("Invalid session token");
      }

      request.user = session.user;
      return true;
    } catch (_error) {
      throw new UnauthorizedException("Invalid session token.");
    }
  }
}
