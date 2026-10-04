export type SaleStatus = 'pending' | 'paid' | 'cancelled';

export interface Sale {
  id: number;
  orderNo: string;
  customer: string;
  date: string;
  itemCount: number;
  total: number;
  status: SaleStatus;
}
