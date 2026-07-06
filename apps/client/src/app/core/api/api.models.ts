// Interfaces mirroring the Foundry API (apps/api) response and request bodies.
// Prisma Decimal columns serialize as strings; dates arrive as ISO strings.

export type Currency = 'USD' | 'EUR' | 'GBP' | 'KES';
export type ClientStatus = 'active' | 'lead' | 'archived';
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed';
export type InvoiceStatus =
  'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled';
export type QuoteStatus =
  'draft' | 'sent' | 'accepted' | 'declined' | 'expired';
export type PaymentMethod =
  | 'card'
  | 'bank_transfer'
  | 'stripe'
  | 'paypal'
  | 'cash'
  | 'mobile_money'
  | 'other';
export type ExpenseCategory =
  'software' | 'travel' | 'meals' | 'office' | 'marketing' | 'other';
export type DocumentType = 'contract' | 'nda' | 'receipt' | 'report' | 'other';

export interface PaginatedResponse<T> {
  count?: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface PaginationQuery {
  cursor?: string;
  take?: number;
}

//  auth

export interface SignupRequest {
  name: string;
  email: string;
  password: string;
  workspaceName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
  defaultWorkspace?: Workspace;
}

export interface MeResponse extends AuthUser {
  workspaces: Workspace[];
}

export interface MessageResponse {
  message: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  otp: string;
  newPassword: string;
}

//  workspaces

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  currency: Currency;
  status: ClientStatus;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkspaceRequest {
  name: string;
  currency?: Currency;
  status?: ClientStatus;
}

export type UpdateWorkspaceRequest = Partial<CreateWorkspaceRequest>;

//  clients

export interface ApiClient {
  id: string;
  name: string;
  email: string;
  company: string | null;
  currency: Currency;
  status: ClientStatus;
  phone: string | null;
  taxId: string | null;
  address: string | null;
  notes: string | null;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClientRequest {
  name: string;
  email: string;
  company?: string;
  currency?: Currency;
  status?: ClientStatus;
  phone?: string;
  taxId?: string;
  address?: string;
  notes?: string;
  workspaceId?: string;
}

export type UpdateClientRequest = Partial<
  Omit<CreateClientRequest, 'workspaceId'>
>;

export interface ListClientsQuery extends PaginationQuery {
  workspaceId?: string;
  status?: ClientStatus;
  search?: string;
}

//  projects

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  budget: string;
  hourlyRate: string | null;
  startDate: string;
  endDate: string | null;
  description: string | null;
  clientId: string;
}

export interface CreateProjectRequest {
  name: string;
  clientId: string;
  status?: ProjectStatus;
  budget?: number;
  hourlyRate?: number;
  startDate: string;
  endDate?: string;
  description?: string;
}

export type UpdateProjectRequest = Partial<
  Omit<CreateProjectRequest, 'clientId'>
>;

export interface ListProjectsQuery extends PaginationQuery {
  clientId?: string;
  status?: ProjectStatus;
}

//  invoices / quotes

export interface LineItemRequest {
  description: string;
  quantity: number;
  rate: number;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: string;
  rate: string;
  invoiceId: string;
}

export interface Invoice {
  id: string;
  number: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  currency: Currency;
  taxRate: string;
  discount: string;
  notes: string | null;
  clientId: string;
  projectId: string | null;
  items: InvoiceItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvoiceRequest {
  clientId: string;
  projectId?: string;
  number?: string;
  status?: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  currency?: Currency;
  taxRate?: number;
  discount?: number;
  notes?: string;
  items: LineItemRequest[];
}

export type UpdateInvoiceRequest = Partial<
  Omit<CreateInvoiceRequest, 'clientId'>
>;

export interface ListInvoicesQuery extends PaginationQuery {
  clientId?: string;
  projectId?: string;
  status?: InvoiceStatus;
}

export interface QuoteItem {
  id: string;
  description: string;
  quantity: string;
  rate: string;
  quoteId: string;
}

export interface Quote {
  id: string;
  number: string;
  status: QuoteStatus;
  issueDate: string;
  validUntil: string;
  currency: Currency;
  taxRate: string;
  notes: string | null;
  clientId: string;
  items: QuoteItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuoteRequest {
  clientId: string;
  number?: string;
  status?: QuoteStatus;
  issueDate: string;
  validUntil: string;
  currency?: Currency;
  taxRate?: number;
  notes?: string;
  items: LineItemRequest[];
}

export type UpdateQuoteRequest = Partial<Omit<CreateQuoteRequest, 'clientId'>>;

export interface ListQuotesQuery extends PaginationQuery {
  clientId?: string;
  status?: QuoteStatus;
}

//  payments

export interface Payment {
  id: string;
  amount: string;
  currency: Currency;
  method: PaymentMethod;
  reference: string | null;
  date: string;
  notes: string | null;
  clientId: string;
  invoiceId: string | null;
  createdAt: string;
}

export interface CreatePaymentRequest {
  clientId: string;
  invoiceId?: string;
  amount: number;
  currency?: Currency;
  method?: PaymentMethod;
  reference?: string;
  date: string;
  notes?: string;
  markInvoicePaid?: boolean;
}

export type UpdatePaymentRequest = Partial<
  Omit<CreatePaymentRequest, 'clientId' | 'markInvoicePaid'>
>;

export interface ListPaymentsQuery extends PaginationQuery {
  clientId?: string;
  invoiceId?: string;
  method?: PaymentMethod;
}

//  expenses

export interface Expense {
  id: string;
  vendor: string;
  category: ExpenseCategory;
  amount: string;
  currency: Currency;
  date: string;
  billable: boolean;
  notes: string | null;
  projectId: string | null;
}

export interface CreateExpenseRequest {
  vendor: string;
  category?: ExpenseCategory;
  amount: number;
  currency?: Currency;
  date: string;
  billable?: boolean;
  notes?: string;
  projectId?: string;
}

export type UpdateExpenseRequest = Partial<CreateExpenseRequest>;

export interface ListExpensesQuery extends PaginationQuery {
  projectId?: string;
  category?: ExpenseCategory;
  billable?: boolean;
}

//  documents / uploads

export interface ApiDocument {
  id: string;
  name: string;
  type: DocumentType;
  storageKey: string;
  size: number;
  mimeType: string | null;
  notes: string | null;
  clientId: string | null;
  projectId: string | null;
  uploadedAt: string;
}

export interface CreateDocumentRequest {
  name: string;
  type?: DocumentType;
  storageKey: string;
  size?: number;
  mimeType?: string;
  notes?: string;
  clientId?: string;
  projectId?: string;
}

export type UpdateDocumentRequest = Partial<CreateDocumentRequest>;

export interface ListDocumentsQuery extends PaginationQuery {
  clientId?: string;
  projectId?: string;
  type?: DocumentType;
}

export interface StoredFile {
  key: string;
  url: string;
  size: number;
  mimeType: string;
  originalName: string;
}
