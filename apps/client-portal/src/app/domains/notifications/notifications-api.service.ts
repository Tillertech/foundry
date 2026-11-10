import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE, PaginatedResponse, toParams } from '@foundry/shared-util';
import {
  ListPortalNotificationsQuery,
  PortalNotification,
} from './notification.models';

@Injectable({ providedIn: 'root' })
export class PortalNotificationsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/portal/notifications`;

  list(
    query?: ListPortalNotificationsQuery,
  ): Observable<PaginatedResponse<PortalNotification>> {
    return this.http.get<PaginatedResponse<PortalNotification>>(this.base, {
      params: toParams(query as Record<string, unknown>),
    });
  }

  unreadCount(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.base}/unread-count`);
  }

  markRead(id: string): Observable<PortalNotification> {
    return this.http.patch<PortalNotification>(`${this.base}/${id}/read`, {});
  }

  markAllRead(): Observable<{ count: number }> {
    return this.http.post<{ count: number }>(`${this.base}/read-all`, {});
  }
}
