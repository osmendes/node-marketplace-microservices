import { Test, type TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { DlqController } from "../dlq.controller";
import { DlqService } from "../dlq.service";

describe("DlqController", () => {
  let controller: DlqController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DlqController],
      providers: [
        {
          provide: DlqService,
          useValue: {
            getStats: async () => ({
              queueName: "payment_queue.dlq",
              messageCount: 0,
              consumerCount: 0,
            }),
            getMessages: async () => [],
          },
        },
      ],
    }).compile();

    controller = module.get<DlqController>(DlqController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });
});
