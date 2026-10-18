import { Injectable } from "@nestjs/common";

export interface HealthResponse {
  status: "ok";
  service: "users-service";
}

@Injectable()
export class AppService {
  getHello(): string {
    return "Hello World!";
  }

  getHealth(): HealthResponse {
    return {
      status: "ok",
      service: "users-service",
    };
  }
}
