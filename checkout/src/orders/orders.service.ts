import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { CartService } from "../cart/cart.service";
import { Cart, CartStatus } from "../cart/entities/cart.entity";
import { PaymentQueueService } from "../events/payment-queue/payment-queue.service";
import type { PaymentOrderMessage } from "../events/payment-queue.interface";
import type { PaymentResultMessage } from "../events/payment-result.interface";
import type { CheckoutDto } from "./dto/checkout.dto";
import { Order, OrderStatus } from "./entities/order.entity";

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly cartService: CartService,
    private readonly paymentQueueService: PaymentQueueService,
    private readonly dataSource: DataSource,
  ) {}

  async checkout(userId: string, dto: CheckoutDto): Promise<Order> {
    const cart = await this.cartService.getActiveCart(userId);

    if (!cart?.items || cart.items.length === 0) {
      throw new BadRequestException("Cart is empty");
    }

    const order: Order = await this.dataSource.transaction(async (manager) => {
      const createdOrder: Order = manager.create(Order, {
        userId,
        cartId: cart.id,
        total: cart.total,
        paymentMethod: dto.paymentMethod,
        status: OrderStatus.PENDING,
      });
      const savedOrder: Order = await manager.save(createdOrder);

      const activeCart: Cart | null = await manager.findOne(Cart, {
        where: {
          id: cart.id,
          userId,
          status: CartStatus.ACTIVE,
        },
      });

      if (!activeCart) {
        throw new NotFoundException("Active cart not found");
      }

      activeCart.status = CartStatus.COMPLETED;
      await manager.save(activeCart);

      return savedOrder;
    });

    const paymentMessage: PaymentOrderMessage = {
      orderId: order.id,
      userId: order.userId,
      amount: Number(order.total),
      items: cart.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        price: Number(item.price),
      })),
      paymentMethod: order.paymentMethod,
    };

    await this.paymentQueueService.publishPaymentOrder(paymentMessage);

    return order;
  }

  async findAllByUser(userId: string): Promise<Order[]> {
    return this.orderRepository.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });
  }

  async findOneByUser(userId: string, orderId: string): Promise<Order> {
    const order: Order | null = await this.orderRepository.findOne({
      where: {
        id: orderId,
        userId,
      },
    });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    return order;
  }

  async applyPaymentResult(message: PaymentResultMessage): Promise<void> {
    this.validatePaymentResultMessage(message);

    const targetStatus: OrderStatus = message.status === "approved" ? OrderStatus.PAID : OrderStatus.FAILED;

    const order: Order | null = await this.orderRepository.findOne({
      where: { id: message.orderId },
    });

    if (!order) {
      this.logger.error(`Order not found for payment result: orderId=${message.orderId}`);
      throw new NotFoundException(`Order not found for orderId ${message.orderId}`);
    }

    if (order.status === targetStatus) {
      this.logger.log(
        `Order already at target status: orderId=${order.id}, status=${order.status}, paymentId=${message.paymentId}`,
      );
      return;
    }

    order.status = targetStatus;
    await this.orderRepository.save(order);

    this.logger.log(
      `Order status updated from payment result: orderId=${order.id}, status=${order.status}, paymentId=${message.paymentId}`,
    );
  }

  private validatePaymentResultMessage(message: PaymentResultMessage): void {
    if (!message.orderId) {
      throw new BadRequestException("Payment result message missing orderId");
    }

    if (!message.paymentId) {
      throw new BadRequestException("Payment result message missing paymentId");
    }

    if (!message.userId) {
      throw new BadRequestException("Payment result message missing userId");
    }

    if (message.status !== "approved" && message.status !== "rejected") {
      throw new BadRequestException("Payment result message has invalid status");
    }

    if (typeof message.amount !== "number" || Number.isNaN(message.amount)) {
      throw new BadRequestException("Payment result message has invalid amount");
    }
  }
}
