const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CommerceCategory {
  id: string;
  tenantId: string;
  name: string;
  order: number;
  createdAt: string;
  _count?: { products: number };
}

export interface CommerceProduct {
  id: string;
  tenantId: string;
  categoryId: string | null;
  category?: { id: string; name: string } | null;
  name: string;
  reference: string | null;
  barcode: string | null;
  unit: string;
  buyPrice: number;
  sellPrice: number;
  stockQty: number;
  stockAlert: number;
  imageUrl: string | null;
  expiresAt: string | null;
  // Unités multiples / Conversion
  purchaseUnit: string | null;
  conversionFactor: number | null;
  conversionNote: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface StockInbound {
  id: string;
  tenantId: string;
  productId: string;
  receivedQty: number;
  receivedUnit: string;
  convertedQty: number;
  conversionFactor: number;
  supplierId?: string;
  reference?: string;
  notes?: string;
  createdAt: string;
  product?: { id: string; name: string; unit: string };
}

export interface CommerceCustomer {
  id: string;
  tenantId: string;
  name: string;
  phone: string | null;
  address: string | null;
  totalDebt: number;
  isActive: boolean;
  createdAt: string;
  sales?: CommerceSale[];
}

export interface CommerceSupplier {
  id: string;
  tenantId: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface SaleItem {
  id: string;
  productId: string;
  product?: { id: string; name: string; unit: string };
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface CommerceSale {
  id: string;
  tenantId: string;
  receiptNumber: string;
  cashierId: string;
  customerId: string | null;
  customer?: { id: string; name: string } | null;
  totalAmount: number;
  paidAmount: number;
  changeAmount: number;
  remainingDebt: number;
  paymentMethod: string;
  status: 'COMPLETED' | 'PARTIAL' | 'CANCELLED';
  notes: string | null;
  items: SaleItem[];
  createdAt: string;
}

export interface CommerceDashboardStats {
  today: { revenue: number; collected: number; debt: number; salesCount: number; expenses: number; cog: number; grossProfit: number; netProfit: number };
  month: { revenue: number; collected: number; remainingDebt: number; salesCount: number; expenses: number; cog: number; grossProfit: number; netProfit: number };
  inventory: { totalProducts: number; lowStockCount: number };
  totalCustomers: number;
  topProducts: { productId: string; name: string; unit: string; totalQty: number; totalRevenue: number; totalCost: number; grossProfit: number }[];
  recentSales: Partial<CommerceSale>[];
}

export interface CommerceChartRow {
  date: string;
  revenue: number;
  collected: number;
  salesCount: number;
  expenses: number;
  cog: number;
  grossProfit: number;
  netProfit: number;
}

export interface CommerceAnalytics {
  week: {
    thisRevenue: number; lastRevenue: number;
    thisProfit: number;  lastProfit: number;
    thisCount: number;   lastCount: number;
    revenueChange: number | null;
    profitChange: number | null;
  };
  alerts: {
    lowMarginProducts: { id: string; name: string; sellingPrice: number; costPrice: number; margin: number | null }[];
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageCount: number;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function request<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    try {
      const err = JSON.parse(text);
      throw new Error(err.message || 'Erreur API');
    } catch {
      throw new Error(text || res.statusText || 'Erreur API');
    }
  }
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

// ─── Catégories ───────────────────────────────────────────────────────────────

export const getCategories = (token: string) =>
  request<CommerceCategory[]>('/commerce/categories', token);

export const createCategory = (token: string, data: { name: string; order?: number }) =>
  request<CommerceCategory>('/commerce/categories', token, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateCategory = (token: string, id: string, data: { name?: string; order?: number }) =>
  request<CommerceCategory>(`/commerce/categories/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const deleteCategory = (token: string, id: string) =>
  request<void>(`/commerce/categories/${id}`, token, { method: 'DELETE' });

// ─── Produits ─────────────────────────────────────────────────────────────────

export interface ProductFilters {
  search?: string;
  categoryId?: string;
  lowStock?: boolean;
  page?: number;
  limit?: number;
}

export const getProducts = (token: string, filters: ProductFilters = {}) => {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.lowStock) params.set('lowStock', 'true');
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return request<PaginatedResponse<CommerceProduct>>(
    `/commerce/products${qs ? `?${qs}` : ''}`,
    token,
  );
};

export const getProduct = (token: string, id: string) =>
  request<CommerceProduct>(`/commerce/products/${id}`, token);

export const getLowStockAlerts = (token: string) =>
  request<CommerceProduct[]>('/commerce/products/alerts/low-stock', token);

export const createProduct = (token: string, data: Partial<CommerceProduct>) =>
  request<CommerceProduct>('/commerce/products', token, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateProduct = (token: string, id: string, data: Partial<CommerceProduct>) =>
  request<CommerceProduct>(`/commerce/products/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const adjustStock = (
  token: string,
  id: string,
  data: { quantity: number; type: 'IN' | 'OUT' | 'ADJUSTMENT' | 'RETURN'; reason?: string },
) =>
  request<CommerceProduct>(`/commerce/products/${id}/stock`, token, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const deleteProduct = (token: string, id: string) =>
  request<void>(`/commerce/products/${id}`, token, { method: 'DELETE' });

// ─── Clients ──────────────────────────────────────────────────────────────────

export const getCustomers = (token: string, search?: string) => {
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  return request<CommerceCustomer[]>(`/commerce/customers${qs}`, token);
};

export const getCustomer = (token: string, id: string) =>
  request<CommerceCustomer>(`/commerce/customers/${id}`, token);

export const createCustomer = (token: string, data: { name: string; phone?: string; address?: string }) =>
  request<CommerceCustomer>('/commerce/customers', token, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateCustomer = (token: string, id: string, data: Partial<CommerceCustomer>) =>
  request<CommerceCustomer>(`/commerce/customers/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const deleteCustomer = (token: string, id: string) =>
  request<void>(`/commerce/customers/${id}`, token, { method: 'DELETE' });

export const payCustomerDebt = (token: string, id: string, amount: number) =>
  request<{ customerId: string; amountPaid: number; previousDebt: number; remainingDebt: number }>(
    `/commerce/customers/${id}/pay`,
    token,
    { method: 'POST', body: JSON.stringify({ amount }) },
  );

// ─── Fournisseurs ─────────────────────────────────────────────────────────────

export const getSuppliers = (token: string) =>
  request<CommerceSupplier[]>('/commerce/suppliers', token);

export const createSupplier = (
  token: string,
  data: { name: string; phone?: string; email?: string; address?: string },
) =>
  request<CommerceSupplier>('/commerce/suppliers', token, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateSupplier = (token: string, id: string, data: Partial<CommerceSupplier>) =>
  request<CommerceSupplier>(`/commerce/suppliers/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const deleteSupplier = (token: string, id: string) =>
  request<void>(`/commerce/suppliers/${id}`, token, { method: 'DELETE' });

// ─── Ventes ───────────────────────────────────────────────────────────────────

export interface CreateSalePayload {
  items: { productId: string; quantity: number; unitPrice: number }[];
  paidAmount: number;
  paymentMethod?: 'CASH' | 'MOBILE_MONEY' | 'CREDIT';
  customerId?: string;
  notes?: string;
}

export interface SaleFilters {
  date?: string;
  cashierId?: string;
  customerId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export const getSales = (token: string, filters: SaleFilters = {}) => {
  const params = new URLSearchParams();
  if (filters.date) params.set('date', filters.date);
  if (filters.cashierId) params.set('cashierId', filters.cashierId);
  if (filters.customerId) params.set('customerId', filters.customerId);
  if (filters.status) params.set('status', filters.status);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return request<PaginatedResponse<CommerceSale>>(
    `/commerce/sales${qs ? `?${qs}` : ''}`,
    token,
  );
};

export const getSale = (token: string, id: string) =>
  request<CommerceSale>(`/commerce/sales/${id}`, token);

export const createSale = (token: string, data: CreateSalePayload) =>
  request<CommerceSale>('/commerce/sales', token, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const cancelSale = (token: string, id: string) =>
  request<{ message: string }>(`/commerce/sales/${id}/cancel`, token, {
    method: 'PATCH',
  });

export const recordSalePayment = (token: string, id: string, amount: number) =>
  request<CommerceSale>(`/commerce/sales/${id}/record-payment`, token, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });

export const payAllSalesBatch = (token: string, saleIds: string[]) =>
  request<{ totalPaid: number; salesCount: number; sales: CommerceSale[]; type: string }>(
    '/commerce/sales/batch/pay-all',
    token,
    {
      method: 'POST',
      body: JSON.stringify({ saleIds }),
    },
  );

export const payCustomerAllDebt = (token: string, customerId: string) =>
  request<{ customerId: string; customerName: string; amountPaid: number; previousDebt: number; remainingDebt: number; type: string; paymentId: string; paidSales: any[]; createdAt: string }>(
    `/commerce/customers/${customerId}/pay-all`,
    token,
    { method: 'POST' },
  );

export const getCustomerPaymentHistory = (token: string, customerId: string) =>
  request<any[]>(
    `/commerce/customers/${customerId}/payment-history`,
    token,
  );

// ─── Unités multiples / Conversion ────────────────────────────────────────────

export const configureConversion = (
  token: string,
  productId: string,
  data: {
    purchaseUnit: string;
    conversionFactor: number;
    conversionNote: string;
  },
) =>
  request<CommerceProduct>(`/commerce/products/${productId}/conversion`, token, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const receiveStock = (
  token: string,
  productId: string,
  data: {
    receivedQty: number;
    receivedUnit: string;
    supplierId?: string;
    reference?: string;
    notes?: string;
  },
) =>
  request<{
    product: CommerceProduct;
    inbound: StockInbound;
    message: string;
  }>(`/commerce/products/${productId}/receive`, token, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const getStockInbounds = (token: string, productId: string, limit = 50) =>
  request<StockInbound[]>(`/commerce/products/${productId}/inbounds?limit=${limit}`, token);

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const getCommerceDashboard = (token: string) =>
  request<CommerceDashboardStats>('/commerce/dashboard', token);

export const getRevenueChart = (token: string, days = 30) =>
  request<CommerceChartRow[]>(`/commerce/dashboard/chart?days=${days}`, token);

export const getCommerceAnalytics = (token: string) =>
  request<CommerceAnalytics>('/commerce/dashboard/analytics', token);

export interface StockMovement {
  id: string;
  tenantId: string;
  productId: string;
  userId: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT' | 'RETURN';
  quantity: number;
  reason?: string;
  createdAt: string;
}

export const getStockMovements = (token: string, productId: string, limit = 100) =>
  request<{
    product: { id: string; name: string; unit: string; currentStock: number };
    movements: StockMovement[];
  }>(`/commerce/products/${productId}/movements?limit=${limit}`, token);

// ─── Envoi reçu par email ─────────────────────────────────────────────────

export const sendSalesReceiptEmail = (token: string, saleId: string, email: string) =>
  request<{ message: string; success: boolean }>(`/commerce/sales/${saleId}/send-receipt-email`, token, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });

// ─── Bons de Réception ────────────────────────────────────────────────────────

export interface ReceiptLine {
  id: string;
  receiptId: string;
  productId: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
  totalPrice?: number;
  notes?: string;
  createdAt: string;
  product?: { id: string; name: string; unit: string; stockQty?: number; reference?: string };
}

export interface StockReceipt {
  id: string;
  tenantId: string;
  receiptNumber: string;
  referenceNumber?: string;
  supplierId?: string;
  supplierName: string;
  receivedAt: string;
  receivedByUserId: string;
  receivedByName: string;
  verifiedByUserId?: string;
  verifiedAt?: string;
  status: 'DRAFT' | 'RECEIVED' | 'VERIFIED' | 'CANCELLED';
  notes?: string;
  totalItems: number;
  createdAt: string;
  updatedAt: string;
  supplier?: { id: string; name: string; phone?: string; email?: string };
  lines?: ReceiptLine[];
}

export interface CreateReceiptPayload {
  supplierId?: string;
  supplierName: string;
  referenceNumber?: string;
  lines: {
    productId: string;
    quantity: number;
    unit: string;
    unitPrice?: number;
    notes?: string;
  }[];
  notes?: string;
  amountDue?: number;
}

export const createStockReceipt = (token: string, data: CreateReceiptPayload) =>
  request<StockReceipt>('/commerce/stock-receipts', token, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const getStockReceipts = (token: string, filters: { supplierId?: string; status?: string; page?: number; limit?: number } = {}) => {
  const params = new URLSearchParams();
  if (filters.supplierId) params.set('supplierId', filters.supplierId);
  if (filters.status) params.set('status', filters.status);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return request<PaginatedResponse<StockReceipt>>(
    `/commerce/stock-receipts${qs ? `?${qs}` : ''}`,
    token,
  );
};

export const getStockReceipt = (token: string, id: string) =>
  request<StockReceipt>(`/commerce/stock-receipts/${id}`, token);

export const verifyStockReceipt = (token: string, id: string) =>
  request<StockReceipt>(`/commerce/stock-receipts/${id}/verify`, token, {
    method: 'PATCH',
  });

export const cancelStockReceipt = (token: string, id: string) =>
  request<void>(`/commerce/stock-receipts/${id}/cancel`, token, {
    method: 'PATCH',
  });

export const getReceiptStats = (token: string, days = 30) =>
  request<{ period: string; totalReceived: number; totalValue: number; topSuppliers: any[] }>(
    `/commerce/stock-receipts/stats/overview?days=${days}`,
    token,
  );

// ─── Dépenses ────────────────────────────────────────────────────────────────

export interface CommerceExpense {
  id: string;
  tenantId: string;
  amount: number;
  category: string;
  description?: string;
  date: string;
  createdAt: string;
}

export const getExpenses = (token: string, filters: { month?: string; category?: string } = {}) => {
  const params = new URLSearchParams();
  if (filters.month)    params.set('month', filters.month);
  if (filters.category) params.set('category', filters.category);
  const qs = params.toString();
  return request<CommerceExpense[]>(`/commerce/expenses${qs ? `?${qs}` : ''}`, token);
};

export const createExpense = (token: string, data: { amount: number; category: string; description?: string; date?: string }) =>
  request<CommerceExpense>('/commerce/expenses', token, { method: 'POST', body: JSON.stringify(data) });

export const deleteExpense = (token: string, id: string) =>
  request<void>(`/commerce/expenses/${id}`, token, { method: 'DELETE' });

// ─── Situation journalière ────────────────────────────────────────────────────

export const getDailySituation = (token: string, date?: string) => {
  const qs = date ? `?date=${date}` : '';
  return request<any>(`/commerce/dashboard/daily${qs}`, token);
};

// ─── Dettes fournisseurs ──────────────────────────────────────────────────────

export interface SupplierPayment {
  id: string;
  tenantId: string;
  receiptId: string;
  supplierId?: string;
  supplierName: string;
  amount: number;
  paymentMethod: string;
  notes?: string;
  paidByUserId: string;
  paidByName: string;
  createdAt: string;
  receipt?: {
    id: string;
    receiptNumber: string;
    amountDue?: number;
    amountPaid: number;
    paymentStatus: string;
  };
}

export interface SupplierDebtReceipt {
  id: string;
  receiptNumber: string;
  supplierName: string;
  supplierId?: string;
  receivedAt: string;
  amountDue: number;
  amountPaid: number;
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID';
  referenceNumber?: string;
  notes?: string;
  supplier?: { id: string; name: string; phone?: string };
  supplierPayments: SupplierPayment[];
}

export interface SupplierDebtsResponse {
  totalOwed: number;
  receiptCount: number;
  suppliers: {
    supplierName: string;
    supplierId: string | null;
    phone: string | null;
    totalOwed: number;
    receipts: SupplierDebtReceipt[];
  }[];
}

export interface SupplierPaymentResult {
  paymentId: string;
  receiptId: string;
  receiptNumber: string;
  supplierName: string;
  supplierId?: string;
  amountPaid: number;
  totalAmountPaid: number;
  amountDue: number;
  remainingDebt: number;
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID';
  paymentMethod: string;
  paidAt: string;
}

export const getSupplierDebts = (token: string, supplierId?: string) => {
  const qs = supplierId ? `?supplierId=${supplierId}` : '';
  return request<SupplierDebtsResponse>(`/commerce/supplier-debts${qs}`, token);
};

export const getSupplierDebtStats = (token: string) =>
  request<{ totalOwed: number; paidThisMonth: number; unpaidCount: number; partialCount: number }>(
    '/commerce/supplier-debts/stats', token
  );

export const getSupplierPaymentHistory = (token: string, filters: { supplierId?: string; month?: string } = {}) => {
  const params = new URLSearchParams();
  if (filters.supplierId) params.set('supplierId', filters.supplierId);
  if (filters.month)      params.set('month', filters.month);
  const qs = params.toString();
  return request<{ payments: SupplierPayment[]; totalPaid: number }>(
    `/commerce/supplier-debts/history${qs ? `?${qs}` : ''}`, token
  );
};

export const paySupplierDebt = (
  token: string,
  receiptId: string,
  data: { amount: number; paymentMethod?: string; notes?: string },
) =>
  request<SupplierPaymentResult>(`/commerce/supplier-debts/${receiptId}/pay`, token, {
    method: 'POST',
    body: JSON.stringify(data),
  });

// ─── Livre de caisse ─────────────────────────────────────────────────────────

export interface CaisseMovement {
  type: 'IN' | 'OUT';
  category: 'SALE' | 'DEBT_RECOVERY' | 'EXPENSE' | 'SUPPLIER_PAYMENT';
  amount: number;
  method: string;
  label: string;
  sub: string;
  at: string;
  id: string;
}

export interface CaisseDay {
  date: string;
  session: { id: string | null; notes: string | null };
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  closingBalance: number;
  breakdown: {
    salesCash: number;
    debtRecovered: number;
    expenses: number;
    supplierPayments: number;
  };
  byMethod: Record<string, { in: number; out: number }>;
  movements: CaisseMovement[];
  counts: { sales: number; debtRecoveries: number; expenses: number; supplierPayments: number };
}

export interface CaisseHistoryRow {
  date: string;
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  closingBalance: number;
}

export const getCaisseDay = (token: string, date?: string) =>
  request<CaisseDay>(`/commerce/caisse/day${date ? `?date=${date}` : ''}`, token);

export const upsertCaisseSession = (token: string, data: { date: string; openingBalance: number; notes?: string }) =>
  request<{ id: string; openingBalance: number }>('/commerce/caisse/session', token, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const getCaisseHistory = (token: string, days = 30) =>
  request<CaisseHistoryRow[]>(`/commerce/caisse/history?days=${days}`, token);
