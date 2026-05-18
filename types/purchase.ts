export type PurchaseCategory =
  | 'food_ingredients'
  | 'alcohol'
  | 'consumables'
  | 'labor'
  | 'rent'
  | 'electricity'
  | 'gas'
  | 'water'
  | 'telecom'
  | 'pos_fee'
  | 'insurance'
  | 'fuel'
  | 'other';

export type PurchaseInputMethod = 'receipt_photo' | 'manual' | 'auto_fixed';

export interface PurchaseItem {
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface PurchaseRecord {
  id?: string;
  storeId?: string;
  date: string;
  vendorName: string;
  totalAmount: number;
  taxAmount: number;
  netAmount: number;
  category: PurchaseCategory;
  items: PurchaseItem[];
  inputMethod: PurchaseInputMethod;
  receiptImageUrl?: string;
  note?: string;
  createdAt?: string;
}
