import { Injectable, Logger, type NestMiddleware } from "@nestjs/common";
import { Request, Response } from "express";

@Injectable()
export class LogginMiddleware implements NestMiddleware {
  private readonly logger = new Logger("HTTP");

  use(req: Request, res: Response, next: () => void) {
    const { method, originalUrl, ip } = req;
    const userAgent = req.get("User-Agent") || "";
    const startTime = Date.now();

    this.logger.log(`Incoming Request: ${method} ${originalUrl} - IP: ${ip} - User-Agent ${userAgent}`);

    res.on("finish", () => {
      const { statusCode } = res;
      const contentLength = res.get("Content-Length");
      const duration = Date.now() - startTime;

      this.logger.log(
        `Outgoing Response: ${method} ${originalUrl} - ${statusCode} - ${contentLength || 0}b - ${duration}ms`,
      );

      if (statusCode >= 400) {
        this.logger.error(`Error Response: ${method} ${originalUrl} - ${statusCode} - ${duration}ms`);
      }
    });

    // Logs de erro
    res.on("error", (error) => {
      this.logger.error(`Response Error: ${method} ${originalUrl} - ${error.message}`);
    });

    // Logs de Timeout
    res.on("timeout", () => {
      this.logger.warn(`Response Timeout: ${method} ${originalUrl} - ${Date.now() - startTime}ms`);
    });

    next();
  }
}
