import { PaginationQuery } from '../../core/http/api.types';
import { Currency } from '../shared/models';

export type ExpenseCategory =
  'software' | 'travel' | 'meals' | 'office' | 'marketing' | 'other';

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
