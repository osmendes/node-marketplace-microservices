export interface FakePaymentGatewayResult {
  approved: boolean;
  transactionId: string;
  rejectionReason?: string;
}
