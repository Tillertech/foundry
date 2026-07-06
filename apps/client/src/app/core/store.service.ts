import { Injectable, computed, effect, signal } from '@angular/core';

// ---------- Types (ported from project-flow) ----------
export type Currency = 'USD' | 'EUR' | 'GBP';

export interface Client {
  id: string;
  name: string;
  email: string;
  company?: string;
  currency: Currency;
  status: 'active' | 'lead' | 'archived';
  taxId?: string;
  address?: string;
  notes?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  clientId: string;
  status: 'planning' | 'active' | 'on_hold' | 'completed';
  budget: number;
  hourlyRate?: number;
  startDate: string;
  endDate?: string;
  description?: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
}

export interface Invoice {
  id: string;
  number: string;
  clientId: string;
  projectId?: string;
  status: 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled';
  issueDate: string;
  dueDate: string;
  currency: Currency;
  items: InvoiceItem[];
  taxRate: number; // percent
  discount: number; // flat
  notes?: string;
}

export interface Quote {
  id: string;
  number: string;
  clientId: string;
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';
  issueDate: string;
  validUntil: string;
  currency: Currency;
  items: InvoiceItem[];
  taxRate: number;
  notes?: string;
}

export interface Payment {
  id: string;
  invoiceId?: string;
  clientId: string;
  amount: number;
  currency: Currency;
  method: 'card' | 'bank_transfer' | 'stripe' | 'paypal' | 'cash' | 'other';
  reference?: string;
  date: string;
  notes?: string;
}

export interface Expense {
  id: string;
  vendor: string;
  category: 'software' | 'travel' | 'meals' | 'office' | 'marketing' | 'other';
  amount: number;
  currency: Currency;
  date: string;
  projectId?: string;
  billable: boolean;
  notes?: string;
}

export interface DocumentItem {
  id: string;
  name: string;
  type: 'contract' | 'nda' | 'receipt' | 'report' | 'other';
  clientId?: string;
  projectId?: string;
  size: number; // bytes
  uploadedAt: string;
  notes?: string;
}

export interface State {
  clients: Client[];
  projects: Project[];
  invoices: Invoice[];
  quotes: Quote[];
  payments: Payment[];
  expenses: Expense[];
  documents: DocumentItem[];
}

// ---------- Helpers ----------
export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function nextNumber(
  existing: { number: string }[],
  prefix = 'INV-',
): string {
  const nums = existing
    .map((x) => Number(x.number.replace(prefix, '')))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 1000;
  return `${prefix}${max + 1}`;
}

export function invoiceTotal(
  inv: Pick<Invoice, 'items' | 'taxRate' | 'discount'>,
) {
  const sub = inv.items.reduce((s, it) => s + it.quantity * it.rate, 0);
  const afterDiscount = Math.max(0, sub - (inv.discount || 0));
  const tax = afterDiscount * ((inv.taxRate || 0) / 100);
  return {
    subtotal: sub,
    discount: inv.discount || 0,
    tax,
    total: afterDiscount + tax,
  };
}

export function quoteTotal(q: Pick<Quote, 'items' | 'taxRate'>) {
  const sub = q.items.reduce((s, it) => s + it.quantity * it.rate, 0);
  const tax = sub * ((q.taxRate || 0) / 100);
  return { subtotal: sub, tax, total: sub + tax };
}

export function money(amount: number, currency: Currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ---------- Seed ----------
const now = () => new Date().toISOString();
const uid = newId;

const seed = (): State => ({
  clients: [
    {
      id: 'c1',
      name: 'Elena Ramirez',
      email: 'elena@acmestudio.co',
      company: 'Acme Studio',
      currency: 'USD',
      status: 'active',
      createdAt: now(),
      taxId: 'US-88-2211',
      address: '221B Baker St, NY',
    },
    {
      id: 'c2',
      name: 'Jonas Weber',
      email: 'jonas@northwindlabs.io',
      company: 'Northwind Labs',
      currency: 'EUR',
      status: 'active',
      createdAt: now(),
      taxId: 'DE123456789',
    },
    {
      id: 'c3',
      name: 'Priya Shah',
      email: 'priya@loomivy.com',
      company: 'Loom & Ivy',
      currency: 'USD',
      status: 'active',
      createdAt: now(),
    },
    {
      id: 'c4',
      name: 'Marco Ferro',
      email: 'marco@ferro.arch',
      company: 'Ferro Architects',
      currency: 'EUR',
      status: 'active',
      createdAt: now(),
    },
    {
      id: 'c5',
      name: 'Halo Ventures',
      email: 'billing@halo.vc',
      company: 'Halo Ventures',
      currency: 'USD',
      status: 'lead',
      createdAt: now(),
    },
  ],
  projects: [
    {
      id: 'p1',
      name: 'Marketing site redesign',
      clientId: 'c1',
      status: 'active',
      budget: 24000,
      hourlyRate: 150,
      startDate: '2026-05-01',
    },
    {
      id: 'p2',
      name: 'Data pipeline v2',
      clientId: 'c2',
      status: 'active',
      budget: 58000,
      hourlyRate: 175,
      startDate: '2026-04-15',
    },
    {
      id: 'p3',
      name: 'Brand system',
      clientId: 'c3',
      status: 'planning',
      budget: 12000,
      hourlyRate: 140,
      startDate: '2026-07-10',
    },
    {
      id: 'p4',
      name: 'BIM automation',
      clientId: 'c4',
      status: 'completed',
      budget: 96000,
      hourlyRate: 200,
      startDate: '2025-11-01',
      endDate: '2026-06-01',
    },
  ],
  invoices: [
    {
      id: 'i1',
      number: 'INV-1042',
      clientId: 'c1',
      projectId: 'p1',
      status: 'paid',
      issueDate: '2026-06-20',
      dueDate: '2026-07-12',
      currency: 'USD',
      taxRate: 0,
      discount: 0,
      items: [
        {
          id: uid(),
          description: 'Design sprint - week 3',
          quantity: 40,
          rate: 150,
        },
      ],
    },
    {
      id: 'i2',
      number: 'INV-1041',
      clientId: 'c4',
      projectId: 'p4',
      status: 'sent',
      issueDate: '2026-06-25',
      dueDate: '2026-07-18',
      currency: 'EUR',
      taxRate: 19,
      discount: 0,
      items: [
        {
          id: uid(),
          description: 'BIM automation - final milestone',
          quantity: 1,
          rate: 8067.23,
        },
      ],
    },
    {
      id: 'i3',
      number: 'INV-1040',
      clientId: 'c3',
      status: 'viewed',
      issueDate: '2026-06-28',
      dueDate: '2026-07-20',
      currency: 'USD',
      taxRate: 0,
      discount: 0,
      items: [
        {
          id: uid(),
          description: 'Brand strategy workshop',
          quantity: 1,
          rate: 1200,
        },
      ],
    },
    {
      id: 'i4',
      number: 'INV-1039',
      clientId: 'c2',
      projectId: 'p2',
      status: 'overdue',
      issueDate: '2026-06-05',
      dueDate: '2026-06-30',
      currency: 'EUR',
      taxRate: 19,
      discount: 0,
      items: [
        {
          id: uid(),
          description: 'Data pipeline retainer — June',
          quantity: 1,
          rate: 4873.95,
        },
      ],
    },
    {
      id: 'i5',
      number: 'INV-1038',
      clientId: 'c5',
      status: 'draft',
      issueDate: '2026-07-01',
      dueDate: '2026-07-30',
      currency: 'USD',
      taxRate: 0,
      discount: 0,
      items: [
        {
          id: uid(),
          description: 'Discovery call & scope',
          quantity: 4,
          rate: 250,
        },
        { id: uid(), description: 'Proposal drafting', quantity: 8, rate: 300 },
      ],
    },
  ],
  quotes: [
    {
      id: 'q1',
      number: 'Q-2041',
      clientId: 'c5',
      status: 'sent',
      issueDate: '2026-06-28',
      validUntil: '2026-07-28',
      currency: 'USD',
      taxRate: 0,
      items: [
        {
          id: uid(),
          description: 'Growth engineering — Q3',
          quantity: 1,
          rate: 42000,
        },
      ],
    },
    {
      id: 'q2',
      number: 'Q-2040',
      clientId: 'c3',
      status: 'accepted',
      issueDate: '2026-06-15',
      validUntil: '2026-07-15',
      currency: 'USD',
      taxRate: 0,
      items: [
        { id: uid(), description: 'Brand system', quantity: 1, rate: 12000 },
      ],
    },
  ],
  payments: [
    {
      id: 'pay1',
      invoiceId: 'i1',
      clientId: 'c1',
      amount: 6000,
      currency: 'USD',
      method: 'bank_transfer',
      date: '2026-07-02',
      reference: 'TXN-11223',
    },
    {
      id: 'pay2',
      clientId: 'c2',
      amount: 5800,
      currency: 'EUR',
      method: 'bank_transfer',
      date: '2026-07-01',
      reference: 'SEPA-98812',
    },
    {
      id: 'pay3',
      invoiceId: 'i3',
      clientId: 'c3',
      amount: 1200,
      currency: 'USD',
      method: 'stripe',
      date: '2026-07-03',
      reference: 'pi_3Nabc',
    },
  ],
  expenses: [
    {
      id: 'e1',
      vendor: 'Figma',
      category: 'software',
      amount: 45,
      currency: 'USD',
      date: '2026-07-01',
      billable: false,
    },
    {
      id: 'e2',
      vendor: 'Lufthansa',
      category: 'travel',
      amount: 620,
      currency: 'EUR',
      date: '2026-06-22',
      billable: true,
      projectId: 'p2',
    },
    {
      id: 'e3',
      vendor: 'Notion',
      category: 'software',
      amount: 24,
      currency: 'USD',
      date: '2026-07-01',
      billable: false,
    },
    {
      id: 'e4',
      vendor: 'The Modern',
      category: 'meals',
      amount: 84.5,
      currency: 'USD',
      date: '2026-06-29',
      billable: true,
      projectId: 'p1',
    },
  ],
  documents: [
    {
      id: 'd1',
      name: 'Acme MSA v2.pdf',
      type: 'contract',
      clientId: 'c1',
      size: 480_112,
      uploadedAt: '2026-05-04',
    },
    {
      id: 'd2',
      name: 'Northwind NDA.pdf',
      type: 'nda',
      clientId: 'c2',
      size: 210_004,
      uploadedAt: '2026-04-12',
    },
    {
      id: 'd3',
      name: 'Ferro final report.pdf',
      type: 'report',
      clientId: 'c4',
      projectId: 'p4',
      size: 3_200_998,
      uploadedAt: '2026-06-02',
    },
  ],
});

// ---------- Store ----------
const KEY = 'ledger.store.v1';

@Injectable({ providedIn: 'root' })
export class StoreService {
  private readonly _state = signal<State>(this.load());

  readonly clients = computed(() => this._state().clients);
  readonly projects = computed(() => this._state().projects);
  readonly invoices = computed(() => this._state().invoices);
  readonly quotes = computed(() => this._state().quotes);
  readonly payments = computed(() => this._state().payments);
  readonly expenses = computed(() => this._state().expenses);
  readonly documents = computed(() => this._state().documents);

  constructor() {
    effect(() => {
      const s = this._state();
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(KEY, JSON.stringify(s));
        } catch {
          // storage may be full or unavailable; in-memory state still works
        }
      }
    });
  }

  private load(): State {
    if (typeof localStorage === 'undefined') return seed();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return seed();
      return JSON.parse(raw) as State;
    } catch {
      return seed();
    }
  }

  upsert<K extends keyof State>(key: K, item: State[K][number]): void {
    this._state.update((s) => {
      const arr = s[key] as { id: string }[];
      const idx = arr.findIndex((x) => x.id === item.id);
      const next = [...arr];
      if (idx >= 0) next[idx] = item;
      else next.unshift(item);
      return { ...s, [key]: next };
    });
  }

  remove<K extends keyof State>(key: K, id: string): void {
    this._state.update((s) => ({
      ...s,
      [key]: (s[key] as { id: string }[]).filter((x) => x.id !== id),
    }));
  }

  reset(): void {
    this._state.set(seed());
  }
}
