import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

export enum OrderStatus {
  PENDING = "pending",
  PAID = "paid",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

@Entity("orders")
export class Order {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column({ type: "uuid" })
  cartId: string;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  total: string;

  @Column({
    type: "enum",
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Column({ length: 50 })
  paymentMethod: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
