import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCopy, lucideGlobe } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { Field } from '@foundry/shared-ui';
import {
  capabilityMeta,
  PortalCapabilities,
  PortalSettingsStore,
} from './portal-settings.store';

@Component({
  selector: 'app-portal-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButton, HlmInput, HlmTextarea, HlmSwitchImports, Field],
  providers: [provideIcons({ lucideCopy, lucideGlobe })],
  templateUrl: './portal-settings.html',
})
export class PortalSettings {
  protected readonly store = inject(PortalSettingsStore);

  protected readonly capabilityMeta = capabilityMeta;
  protected readonly capabilityGroups = computed(() => {
    const map = new Map<string, typeof capabilityMeta>();
    for (const c of capabilityMeta) {
      map.set(c.group, [...(map.get(c.group) ?? []), c]);
    }
    return [...map.entries()];
  });

  protected readonly portalUrl = computed(
    () => `https://foundryinstance/${this.store.slug()}`,
  );
  protected readonly activeUsers = computed(
    () => this.store.clientUsers().filter((u) => u.status === 'active').length,
  );
  protected readonly invitedUsers = computed(
    () => this.store.clientUsers().filter((u) => u.status === 'invited').length,
  );

  protected readonly slugDraft = signal(this.store.slug());
  protected readonly welcomeDraft = signal(this.store.welcomeMessage());

  protected copyPortalUrl(): void {
    navigator.clipboard?.writeText(this.portalUrl());
  }

  protected toggleDefault(key: keyof PortalCapabilities, value: boolean): void {
    this.store.setDefaults({ ...this.store.defaults(), [key]: value });
  }

  protected saveBranding(): void {
    this.store.setSlug(this.slugDraft());
    this.store.setWelcomeMessage(this.welcomeDraft());
  }

  protected onSlugInput(value: string): void {
    this.slugDraft.set(value.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
  }
}
