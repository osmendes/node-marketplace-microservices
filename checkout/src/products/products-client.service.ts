import { HttpService } from "@nestjs/axios";
import { BadGatewayException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AxiosError } from "axios";
import { firstValueFrom } from "rxjs";

const TRAILING_SLASH = /\/$/;

export interface ProductsServiceProduct {
  id: string;
  name: string;
  description?: string;
  price: number | string;
  stock?: number;
  sellerId?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable()
export class ProductsClientService {
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    configService: ConfigService,
  ) {
    const baseUrl = configService.get<string>("PRODUCTS_SERVICE_URL");

    if (!baseUrl) {
      throw new Error("PRODUCTS_SERVICE_URL is not defined");
    }

    this.baseUrl = baseUrl.replace(TRAILING_SLASH, "");
  }

  async getProduct(productId: string): Promise<ProductsServiceProduct> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<ProductsServiceProduct>(`${this.baseUrl}/products/${productId}`),
      );

      return data;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadGatewayException) {
        throw error;
      }

      if (error instanceof AxiosError) {
        if (error.response?.status === 404) {
          throw new NotFoundException(`Product ${productId} not found`);
        }

        throw new BadGatewayException("Failed to fetch product from products-service");
      }

      throw new BadGatewayException("Failed to fetch product from products-service");
    }
  }
}
