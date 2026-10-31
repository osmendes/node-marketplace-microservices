import { HttpService } from "@nestjs/axios";
import { BadGatewayException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AxiosError, type AxiosResponse } from "axios";
import { of, throwError } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductsClientService } from "./products-client.service";

describe("ProductsClientService", () => {
  let service: ProductsClientService;
  let httpService: { get: ReturnType<typeof vi.fn> };

  const product = {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    name: "Notebook",
    price: 1999.9,
    isActive: true,
  };

  beforeEach(() => {
    httpService = {
      get: vi.fn(),
    };

    const configService = {
      get: vi.fn().mockReturnValue("http://localhost:3001"),
    } as unknown as ConfigService;

    service = new ProductsClientService(httpService as unknown as HttpService, configService);
  });

  it("throws when PRODUCTS_SERVICE_URL is missing", () => {
    const configService = {
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    expect(() => new ProductsClientService(httpService as unknown as HttpService, configService)).toThrow(
      "PRODUCTS_SERVICE_URL is not defined",
    );
  });

  it("returns product from products-service", async () => {
    httpService.get.mockReturnValue(of({ data: product } as AxiosResponse));

    const result = await service.getProduct(product.id);

    expect(httpService.get).toHaveBeenCalledWith(`http://localhost:3001/products/${product.id}`);
    expect(result).toEqual(product);
  });

  it("strips trailing slash from base URL", async () => {
    const configService = {
      get: vi.fn().mockReturnValue("http://localhost:3001/"),
    } as unknown as ConfigService;

    service = new ProductsClientService(httpService as unknown as HttpService, configService);
    httpService.get.mockReturnValue(of({ data: product } as AxiosResponse));

    await service.getProduct(product.id);

    expect(httpService.get).toHaveBeenCalledWith(`http://localhost:3001/products/${product.id}`);
  });

  it("throws NotFoundException when products-service returns 404", async () => {
    const axiosError = new AxiosError("Not Found");
    axiosError.response = { status: 404 } as AxiosResponse;

    httpService.get.mockReturnValue(throwError(() => axiosError));

    await expect(service.getProduct(product.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws BadGatewayException on network/5xx failures", async () => {
    const axiosError = new AxiosError("Bad Gateway");
    axiosError.response = { status: 502 } as AxiosResponse;

    httpService.get.mockReturnValue(throwError(() => axiosError));

    await expect(service.getProduct(product.id)).rejects.toBeInstanceOf(BadGatewayException);
  });

  it("throws BadGatewayException on unexpected errors", async () => {
    httpService.get.mockReturnValue(throwError(() => new Error("boom")));

    await expect(service.getProduct(product.id)).rejects.toBeInstanceOf(BadGatewayException);
  });
});
