import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE, toParams } from '../../core/http/api-base';
import { ReportSummary, ReportSummaryQuery } from './report.models';

@Injectable({ providedIn: 'root' })
export class ReportsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/reports`;

  /** Business summary for the period; the API caches it for ~5 minutes. */
  summary(query?: ReportSummaryQuery): Observable<ReportSummary> {
    return this.http.get<ReportSummary>(`${this.base}/summary`, {
      params: toParams(query as Record<string, unknown>),
    });
  }
}
