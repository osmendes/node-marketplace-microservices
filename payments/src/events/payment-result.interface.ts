export type PaymentResultStatus = "approved" | "rejected";

export interface PaymentResultMessage {
  orderId: string;
  paymentId: string;
  userId: string;
  status: PaymentResultStatus;
  amount: number;
  transactionId: string | null;
  rejectionReason: string | null;
  processedAt: string;
}
