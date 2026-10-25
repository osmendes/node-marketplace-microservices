import { HttpException } from "@nestjs/common";

type UpstreamResponse = {
  status?: number;
  data?: unknown;
};

type ErrorWithResponse = {
  response?: UpstreamResponse;
  message?: string;
};

export function getHttpErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const status = (error as ErrorWithResponse).response?.status;
  return typeof status === "number" ? status : undefined;
}

export function isHttpClientError(error: unknown): boolean {
  const status = getHttpErrorStatus(error);
  return typeof status === "number" && status >= 400 && status < 500;
}

export function toUpstreamHttpException(error: unknown): HttpException | null {
  if (!isHttpClientError(error)) {
    return null;
  }

  const response = (error as ErrorWithResponse).response;
  const status = response?.status ?? 400;
  const data = response?.data;

  if (data !== undefined && data !== null) {
    return new HttpException(data, status);
  }

  const message = (error as ErrorWithResponse).message || "Request failed";
  return new HttpException({ statusCode: status, message }, status);
}
