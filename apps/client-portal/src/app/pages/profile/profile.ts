import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideKeyRound } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { PortalAuthService } from '../../domains/auth';

@Component({
  selector: 'app-portal-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgIcon, HlmButton],
  providers: [provideIcons({ lucideKeyRound })],
  templateUrl: './profile.html',
})
export class Profile {
  protected readonly auth = inject(PortalAuthService);

  protected readonly me = this.auth.me;
  protected readonly initials = computed(() => {
    const name = this.me()?.name ?? '';
    return name
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  });
}
