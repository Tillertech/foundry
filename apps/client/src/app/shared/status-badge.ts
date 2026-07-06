import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const tones: Record<string, string> = {
  paid: 'bg-success/12 text-success ring-success/20',
  accepted: 'bg-success/12 text-success ring-success/20',
  active: 'bg-success/12 text-success ring-success/20',
  completed: 'bg-success/12 text-success ring-success/20',

  sent: 'bg-info/12 text-info ring-info/20',
  viewed: 'bg-primary/12 text-primary ring-primary/20',

  overdue: 'bg-destructive/12 text-destructive ring-destructive/20',
  declined: 'bg-destructive/12 text-destructive ring-destructive/20',
  cancelled: 'bg-destructive/12 text-destructive ring-destructive/20',

  expired: 'bg-warning/12 text-warning ring-warning/20',
  on_hold: 'bg-warning/12 text-warning ring-warning/20',

  draft: 'bg-muted text-muted-foreground ring-border',
  lead: 'bg-muted text-muted-foreground ring-border',
  planning: 'bg-muted text-muted-foreground ring-border',
  archived: 'bg-muted text-muted-foreground ring-border',
};

@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset"
      [class]="tone()"
    >
      <span class="h-1.5 w-1.5 rounded-full bg-current"></span>
      {{ label() }}
    </span>
  `,
})
export class StatusBadge {
  readonly status = input.required<string>();

  protected readonly tone = computed(() => tones[this.status()] ?? tones['draft']);
  protected readonly label = computed(() => this.status().replace(/_/g, ' '));
}
