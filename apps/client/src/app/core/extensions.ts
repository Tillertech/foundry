import { NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  InjectionToken,
  Provider,
  Type,
  computed,
  inject,
  input,
} from '@angular/core';

/**
 * UI extension points (see EXTENDING.md). An extension registers components
 * for named slots and extra settings tabs through DI; the app renders them in
 * place. With nothing registered every slot renders its built-in content, so
 * the app looks exactly as it does without extensions.
 */

/** Named places in the UI an extension can fill. */
export type SlotName =
  /** Top of the sidebar, in place of the Foundry wordmark. Input: `collapsed`. */
  | 'shell.sidebar.header'
  /** Full-width strip above every page (notices, banners). */
  | 'shell.banner'
  /** Topbar, before the notifications menu. */
  | 'shell.topbar.actions';

export interface SlotRegistration {
  slot: SlotName;
  component: Type<unknown>;
  /** Lower renders first. */
  order?: number;
}

export const FOUNDRY_SLOTS = new InjectionToken<SlotRegistration[]>(
  'FOUNDRY_SLOTS',
);

export function provideSlot(
  slot: SlotName,
  component: Type<unknown>,
  order = 0,
): Provider {
  return {
    provide: FOUNDRY_SLOTS,
    multi: true,
    useValue: { slot, component, order } satisfies SlotRegistration,
  };
}

/** An extra tab on the Settings page. */
export interface SettingsSection {
  /**
   * Tab id. Reusing the id of a built-in placeholder tab (e.g. "templates")
   * replaces that placeholder with this section.
   */
  id: string;
  label: string;
  /** An ng-icons name; register the icon with provideIcons. */
  icon: string;
  component: Type<unknown>;
  /** Lower renders first; built-in tabs keep their order. */
  order?: number;
}

export const SETTINGS_SECTIONS = new InjectionToken<SettingsSection[]>(
  'SETTINGS_SECTIONS',
);

export function provideSettingsSection(section: SettingsSection): Provider {
  return { provide: SETTINGS_SECTIONS, multi: true, useValue: section };
}

/** An entry in the app's navigation (sidebar and the mobile nav). */
export interface NavItem {
  /** Router path, e.g. "/time". */
  path: string;
  label: string;
  /** An ng-icons name; register the icon with provideIcons. */
  icon: string;
  /** Highlight only on an exact path match rather than a prefix. */
  exact?: boolean;
  /**
   * Position among the built-in items, which use 10 (Dashboard) through 100
   * (Settings) in steps of 10. Defaults to 95: after Reports, before Settings.
   */
  order?: number;
}

export const NAV_ITEMS = new InjectionToken<NavItem[]>('NAV_ITEMS');

export function provideNavItem(item: NavItem): Provider {
  return { provide: NAV_ITEMS, multi: true, useValue: item };
}

const DEFAULT_NAV_ORDER = 95;

/** `builtIn` merged with contributed nav items, in order. */
export function navItems(builtIn: NavItem[]): NavItem[] {
  const contributed = inject(NAV_ITEMS, { optional: true }) ?? [];
  return [
    ...builtIn,
    ...contributed.map((item) => ({
      ...item,
      order: item.order ?? DEFAULT_NAV_ORDER,
    })),
  ]
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) => (a.item.order ?? 0) - (b.item.order ?? 0) || a.index - b.index,
    )
    .map(({ item }) => item);
}

/** Components registered for `slot`, in order. */
export function slotComponents(slot: SlotName): Type<unknown>[] {
  const registrations = inject(FOUNDRY_SLOTS, { optional: true }) ?? [];
  return registrations
    .filter((r) => r.slot === slot)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((r) => r.component);
}

/**
 * Renders every component registered for `name`, passing `inputs` through.
 * Use `slotComponents(name).length` to decide whether to show built-in content.
 */
@Component({
  // Public element name for extensions, deliberately outside the app prefix.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'foundry-slot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `
    @for (component of components(); track $index) {
      <ng-container *ngComponentOutlet="component; inputs: inputs()" />
    }
  `,
  host: { class: 'contents' },
})
export class FoundrySlot {
  readonly name = input.required<SlotName>();
  readonly inputs = input<Record<string, unknown>>({});

  private readonly registrations =
    inject(FOUNDRY_SLOTS, { optional: true }) ?? [];

  protected readonly components = computed(() =>
    this.registrations
      .filter((r) => r.slot === this.name())
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((r) => r.component),
  );
}
