import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideDownload,
  lucideFileText,
} from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { PortalAuthService } from '../../domains/auth';
import { DocumentItem, DocumentsApiService } from '../../domains/documents';
import { Project, ProjectsApiService, projectProgress } from '../../domains/projects';
import { isoDay, money } from '@foundry/shared-util';
import { saveBlob } from '../../core/download-file';
import { StatusBadge } from '@foundry/shared-ui';

@Component({
  selector: 'app-portal-project-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgIcon, HlmButton, HlmTabsImports, StatusBadge],
  providers: [
    provideIcons({ lucideArrowLeft, lucideDownload, lucideFileText }),
  ],
  templateUrl: './project-detail.html',
})
export class ProjectDetail {
  readonly id = input.required<string>();

  private readonly projectsApi = inject(ProjectsApiService);
  private readonly documentsApi = inject(DocumentsApiService);
  protected readonly auth = inject(PortalAuthService);

  protected readonly isoDay = isoDay;
  protected readonly money = money;

  protected readonly tab = signal('overview');
  protected readonly loading = signal(true);
  protected readonly project = signal<Project | null>(null);
  protected readonly documents = signal<DocumentItem[]>([]);
  protected readonly documentsLoading = signal(false);

  protected readonly permission = computed(
    () => this.auth.me()?.clientPortal.permission ?? null,
  );

  protected readonly projectsLink = computed(
    () => `/${this.auth.slug() ?? ''}/projects`,
  );

  protected readonly projectDocs = computed(() =>
    this.documents().filter((d) => d.projectId === this.id()),
  );

  protected readonly progress = computed(() => {
    const project = this.project();
    return project ? projectProgress(project.milestones) : null;
  });

  constructor() {
    // Signal inputs aren't guaranteed set until after the constructor runs -
    // defer the id()-dependent fetch to an effect.
    effect(() => {
      const id = this.id();
      this.loading.set(true);
      this.projectsApi.get(id).subscribe({
        next: (project) => {
          this.project.set(project);
          this.loading.set(false);
        },
        error: () => {
          this.project.set(null);
          this.loading.set(false);
        },
      });
    });

    if (this.permission()?.viewDocuments) {
      this.documentsLoading.set(true);
      this.documentsApi.list({ take: 100 }).subscribe({
        next: (res) => {
          this.documents.set(res.results);
          this.documentsLoading.set(false);
        },
        error: () => this.documentsLoading.set(false),
      });
    }
  }

  protected download(doc: DocumentItem): void {
    this.documentsApi.download(doc.id).subscribe((blob) => {
      saveBlob(blob, doc.name);
    });
  }
}
