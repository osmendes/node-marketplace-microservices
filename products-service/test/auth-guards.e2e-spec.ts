import { Controller, Get, type INestApplication, Req } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, type TestingModule } from "@nestjs/testing";
import type { Request } from "express";
import request from "supertest";
import type { App } from "supertest/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "./../src/app.module";
import type { AuthenticatedUser } from "./../src/auth/strategies/jwt.strategy";

@Controller("__test")
class ProtectedTestController {
  @Get("protected")
  getProtected(@Req() req: Request & { user?: AuthenticatedUser }) {
    return req.user;
  }
}

describe("JWT guards (e2e)", () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProtectedTestController],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    jwtService = app.get(JwtService);
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET / remains public without token", async () => {
    await request(app.getHttpServer()).get("/").expect(200).expect("Hello World!");
  });

  it("GET /__test/protected returns 401 without token", async () => {
    await request(app.getHttpServer()).get("/__test/protected").expect(401);
  });

  it("GET /__test/protected returns 401 for invalid token signature", async () => {
    const forged = await new JwtService({ secret: "wrong-secret" }).signAsync({
      sub: "11111111-1111-1111-1111-111111111111",
      email: "forged@example.com",
      role: "buyer",
    });

    await request(app.getHttpServer()).get("/__test/protected").set("Authorization", `Bearer ${forged}`).expect(401);
  });

  it("GET /__test/protected returns 401 for expired token", async () => {
    const expired = await jwtService.signAsync(
      {
        sub: "11111111-1111-1111-1111-111111111111",
        email: "expired@example.com",
        role: "buyer",
      },
      { expiresIn: "-1s" },
    );

    await request(app.getHttpServer()).get("/__test/protected").set("Authorization", `Bearer ${expired}`).expect(401);
  });

  it("GET /__test/protected returns 200 with req.user for valid token", async () => {
    const userId = "11111111-1111-1111-1111-111111111111";
    const email = "buyer@example.com";
    const role = "buyer";

    const token = await jwtService.signAsync({
      sub: userId,
      email,
      role,
    });

    const response = await request(app.getHttpServer())
      .get("/__test/protected")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      id: userId,
      email,
      role,
    });
  });
});
