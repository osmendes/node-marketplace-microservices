import { LogginMiddleware } from "./loggin.middleware";

describe("LogginMiddleware", () => {
  it("should be defined", () => {
    expect(new LogginMiddleware()).toBeDefined();
  });
});
