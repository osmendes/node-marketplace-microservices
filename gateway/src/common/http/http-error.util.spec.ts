import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { getHttpErrorStatus, isHttpClientError, toUpstreamHttpException } from "./http-error.util";

describe("http-error.util", () => {
  it("detects 4xx client errors from axios-like errors", () => {
    const error = { response: { status: 409, data: { message: "Conflict" } }, message: "Request failed" };

    expect(getHttpErrorStatus(error)).toBe(409);
    expect(isHttpClientError(error)).toBe(true);
    expect(isHttpClientError({ response: { status: 500 } })).toBe(false);
    expect(isHttpClientError(new Error("boom"))).toBe(false);
  });

  it("converts upstream 4xx into HttpException preserving status and body", () => {
    const body = { statusCode: 409, message: "Email already exists" };
    const error = { response: { status: 409, data: body }, message: "Request failed" };

    const exception = toUpstreamHttpException(error);

    expect(exception).toBeInstanceOf(HttpException);
    expect(exception?.getStatus()).toBe(409);
    expect(exception?.getResponse()).toEqual(body);
  });
});
