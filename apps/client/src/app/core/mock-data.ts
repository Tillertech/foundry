// Placeholder analytics data mirroring the project-flow design mocks.
// Entity data (clients, invoices, …) lives in StoreService.
export const KPIS = {
  todayRevenue: 4820,
  outstanding: 28450,
  overdue: 6120,
  mrr: 18400,
};

export const revenueSeries = {
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  revenue: [12400, 14200, 15800, 17600, 16900, 19200, 21400, 20800, 22600, 24100, 25800, 27400],
  expenses: [4200, 4800, 5100, 5600, 5300, 6100, 6400, 6200, 6800, 7100, 7500, 7900],
};

export const upcomingInvoices = [
  { id: 'INV-1043', client: 'Kite & Kin', amount: 4200, due: 'in 3 days' },
  { id: 'INV-1044', client: 'Vela Health', amount: 7800, due: 'in 5 days' },
  { id: 'INV-1045', client: 'Northwind Labs', amount: 3200, due: 'in 8 days' },
];
