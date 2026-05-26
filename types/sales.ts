export type SalesInputMethod = 'receipt_photo' | 'screen_capture' | 'excel_upload' | 'manual';

export interface SalesMenuItem {
  name: string;
  quantity: number;
  amount: number;
  category?: string;
  menuId?: string;
}

export interface DailySales {
  id?: string;
  storeId?: string;
  date: string;
  totalRevenue: number;
  discount: number;
  serviceCharge: number;
  serviceAmount: number;
  actualSales: number;
  tax: number;
  netRevenue: number;
  cashCount: number;
  cashAmount: number;
  cardCount: number;
  cardAmount: number;
  tablesUsed: number;
  guestCount: number;
  avgSpend: number;
  openTime?: string;
  closeTime?: string;
  firstOrderTime?: string;
  inputMethod: SalesInputMethod;
  receiptImageUrl?: string;
  note?: string;
  menuItems: SalesMenuItem[];
  isEvent?: boolean;
  createdAt?: string;
}
