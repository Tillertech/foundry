import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlus, lucideSearch } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { Project, StoreService, money, newId } from '../../core/store.service';
import { ToastService } from '../../core/toast.service';
import { DateField } from '../../shared/date-field';
import { EntitySheet } from '../../shared/entity-sheet';
import { Field } from '../../shared/field';
import { ListSkeleton } from '../../shared/list-skeleton';
import { PageHeader } from '../../shared/page-header';
import { StatusBadge } from '../../shared/status-badge';

const emptyProject = (): Project => ({
  id: '',
  name: '',
  clientId: '',
  status: 'planning',
  budget: 0,
  hourlyRate: 0,
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  description: '',
});

@Component({
  selector: 'app-projects',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    NgIcon,
    HlmButton,
    HlmInput,
    HlmTextarea,
    HlmNativeSelectImports,
    DateField,
    EntitySheet,
    Field,
    ListSkeleton,
    PageHeader,
    StatusBadge,
  ],
  providers: [provideIcons({ lucidePlus, lucideSearch })],
  templateUrl: './projects.html',
})
export class Projects {
  protected readonly store = inject(StoreService);
  private readonly toast = inject(ToastService);

  protected readonly query = signal('');
  protected readonly statusFilter = signal('all');
  protected readonly clientFilter = signal('all');
  protected readonly sheetOpen = signal(false);
  protected isNew = true;
  protected form: Project = emptyProject();

  protected readonly clientMap = computed(() =>
    Object.fromEntries(this.store.clients().map((c) => [c.id, c])),
  );

  protected readonly filtered = computed(() => {
    const term = this.query().toLowerCase();
    const status = this.statusFilter();
    const client = this.clientFilter();
    return this.store
      .projects()
      .filter(
        (p) =>
          (status === 'all' || p.status === status) &&
          (client === 'all' || p.clientId === client) &&
          (!term || p.name.toLowerCase().includes(term)),
      );
  });

  protected openNew(): void {
    this.form = { ...emptyProject(), id: newId(), clientId: this.store.clients()[0]?.id ?? '' };
    this.isNew = true;
    this.sheetOpen.set(true);
  }

  protected openEdit(p: Project): void {
    this.form = { ...p };
    this.isNew = false;
    this.sheetOpen.set(true);
  }

  protected save(): void {
    if (!this.form.name.trim() || !this.form.clientId) return;
    this.store.upsert('projects', this.form);
    this.sheetOpen.set(false);
    if (this.isNew) this.toast.created('Project');
    else this.toast.updated('Project');
  }

  protected removeCurrent(): void {
    this.store.remove('projects', this.form.id);
    this.sheetOpen.set(false);
    this.toast.deleted('Project');
  }

  protected readonly money = money;
}
