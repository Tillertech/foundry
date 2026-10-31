import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { buildAppRoutes } from '../app.routes';
import {
  FoundrySlot,
  NavItem,
  navItems,
  provideNavItem,
  provideSlot,
} from './extensions';

@Component({ selector: 'app-test-first', template: 'first:{{ collapsed() }}' })
class First {
  readonly collapsed = input(false);
}

@Component({ selector: 'app-test-second', template: 'second' })
class Second {
  // Slot inputs reach every component in the slot.
  readonly collapsed = input(false);
}

@Component({
  imports: [FoundrySlot],
  template: `<foundry-slot
    name="shell.sidebar.header"
    [inputs]="{ collapsed: true }"
  />`,
})
class Host {}

const BUILT_IN: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: 'a', order: 10 },
  { path: '/reports', label: 'Reports', icon: 'b', order: 90 },
  { path: '/settings', label: 'Settings', icon: 'c', order: 100 },
];

describe('extensions', () => {
  describe('navItems', () => {
    it('returns the built-in items unchanged without extensions', () => {
      const nav = TestBed.runInInjectionContext(() => navItems(BUILT_IN));
      expect(nav.map((i) => i.path)).toEqual(['/', '/reports', '/settings']);
    });

    it('places contributed items by order, default before Settings', () => {
      TestBed.configureTestingModule({
        providers: [
          provideNavItem({ path: '/time', label: 'Time', icon: 'd' }),
          provideNavItem({ path: '/top', label: 'Top', icon: 'e', order: 5 }),
        ],
      });
      const nav = TestBed.runInInjectionContext(() => navItems(BUILT_IN));
      expect(nav.map((i) => i.path)).toEqual([
        '/top',
        '/',
        '/reports',
        '/time',
        '/settings',
      ]);
    });
  });

  describe('FoundrySlot', () => {
    it('renders nothing when no component is registered', () => {
      const fixture = TestBed.createComponent(Host);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent.trim()).toBe('');
    });

    it('renders registered components in order with their inputs', () => {
      TestBed.configureTestingModule({
        providers: [
          provideSlot('shell.sidebar.header', Second, 2),
          provideSlot('shell.sidebar.header', First, 1),
          provideSlot('shell.banner', Second),
        ],
      });
      const fixture = TestBed.createComponent(Host);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent.replace(/\s+/g, '')).toBe(
        'first:truesecond',
      );
    });
  });

  describe('buildAppRoutes', () => {
    it('matches contributed routes before the built-in ones', () => {
      const routes = buildAppRoutes({
        auth: [{ path: 'sso', children: [] }],
        shell: [{ path: 'time', children: [] }],
      });
      const auth = routes.find((r) => r.path === 'auth')?.children ?? [];
      const shell = routes.find((r) => r.path === '')?.children ?? [];
      expect(shell[0].path).toBe('time');
      // Before the catch-all redirect, after the built-in auth pages.
      expect(auth.map((r) => r.path).slice(-2)).toEqual(['sso', '']);
    });

    it('is the stock route table without extensions', () => {
      const shell = buildAppRoutes().find((r) => r.path === '')?.children;
      expect(shell?.[0].path).toBe('');
      expect(shell?.map((r) => r.path)).toContain('settings');
    });
  });
});
