import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { PaymentStatus } from "../enums/payment-status.enum";

@Entity("payments")
export class Payment {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  orderId: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  amount: string;

  @Column({
    type: "enum",
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({ length: 50 })
  paymentMethod: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  transactionId: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  rejectionReason: string | null;

  @Column({ type: "timestamp", nullable: true })
  processedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
