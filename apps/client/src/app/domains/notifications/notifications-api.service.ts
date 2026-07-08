import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE, toParams } from '../../core/http/api-base';
import { PaginatedResponse } from '../../core/http/api.types';
import {
  AppNotification,
  ListNotificationsQuery,
  UnreadCount,
} from './notification.models';

@Injectable({ providedIn: 'root' })
export class NotificationsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/notifications`;

  list(
    query?: ListNotificationsQuery,
  ): Observable<PaginatedResponse<AppNotification>> {
    return this.http.get<PaginatedResponse<AppNotification>>(this.base, {
      params: toParams(query as Record<string, unknown>),
    });
  }

  unreadCount(): Observable<UnreadCount> {
    return this.http.get<UnreadCount>(`${this.base}/unread-count`);
  }

  markRead(id: string): Observable<AppNotification> {
    return this.http.patch<AppNotification>(`${this.base}/${id}/read`, {});
  }

  markAllRead(): Observable<UnreadCount> {
    return this.http.post<UnreadCount>(`${this.base}/read-all`, {});
  }
}
