// Transport-level shapes shared by every resource API.

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

export interface MessageResponse {
  message: string;
}
