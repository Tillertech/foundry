# Extending Foundry

Foundry can be extended without forking it. A plugin is ordinary NestJS and
Angular code that boots Foundry's own app and adds to it through the extension
points below. With no plugins registered, every extension point falls back to
Foundry's built-in behaviour, so the app looks and works exactly as it does
out of the box.

Import only from the two entry points:

| Side          | Entry point                            |
| ------------- | -------------------------------------- |
| API           | `apps/api/src/extension-api.ts`        |
| Workspace app | `apps/client/src/app/extension-api.ts` |

Everything exported there is public API: it keeps its contract across minor
releases, and a breaking change is called out in the release notes. Deep
imports into other files can change at any time.

---

## API

### Booting your own root module

`main.ts` is a one-liner around `bootstrapFoundry`, which applies Foundry's
global prefix (`/api/v1`), validation pipe, Socket.IO adapter, proxy trust and
(in development) Swagger. Boot a module that imports `AppModule` plus your own:

```ts
import { Module } from '@nestjs/common';
import { AppModule, bootstrapFoundry } from './extension-api';
import { TimeTrackingModule } from 'my-foundry-time-tracking';

@Module({ imports: [AppModule, TimeTrackingModule] })
class MyFoundry {}

bootstrapFoundry(MyFoundry);
```

Plain NestJS composition covers most needs without any further hook:

- **Routes:** controllers in your module, protected with `JwtAuthGuard` and
  `@CurrentUser()` exactly like the built-in ones.
- **Reacting to activity:** every change emits a typed domain event
  (`entity.*`, `file.*`, `invoice.*`, ...). Listen with `@OnEvent('invoice.paid')`
  or `@OnEvent('**')`.
- **Cross-cutting behaviour:** global guards and interceptors via `APP_GUARD` /
  `APP_INTERCEPTOR`.
- **Data:** `PrismaService` and `PrismaModule` give you the same client the
  core uses. Treat core tables as read-only; keep your own data in your own
  tables or schema.

### Working with several workspaces

An account can own several workspaces. By default the API spans all of them:
lists and reports cover every workspace the caller owns, and new records go to
the default (oldest) one.

A request can narrow itself to one workspace with the `x-workspace-id` header
(`WORKSPACE_HEADER`). Lists, reports and exchange rates then cover only that
workspace, new records go to it, and `GET /api/v1/workspaces/current` returns
it. The header never grants access: it is always combined with the caller's
ownership, so a workspace id the caller does not own matches nothing.

Inside your own services, inject `WorkspaceScope`:

```ts
@Injectable()
export class TimeEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: WorkspaceScope,
  ) {}

  list(ownerId: string) {
    return this.prisma.client.findMany({
      where: { workspace: this.scope.owned(ownerId) },
    });
  }
}
```

- `owned(ownerId)` is the `WorkspaceWhereInput` for "the caller's workspaces in
  scope".
- `cacheKey()` keeps scoped and unscoped cache entries apart.
- `run(workspaceId, fn)` sets the scope explicitly, for jobs and tests that run
  outside a request.

### Document themes

Provide `PDF_THEME_RESOLVER` to style generated invoices, quotes and receipts
per workspace. Return `null` to keep the built-in design. A resolver that throws
is logged and ignored, so a broken theme never stops an invoice going out.

```ts
@Module({
  providers: [
    {
      provide: PDF_THEME_RESOLVER,
      useValue: {
        async resolve({ workspaceId, kind }) {
          return kind === 'invoice' ? { accent: '#0f766e' } : null;
        },
      } satisfies PdfThemeResolver,
    },
  ],
})
export class BrandedDocumentsModule {}
```

### Mail templates

Set `MAIL_TEMPLATES_DIR` to a directory of Handlebars templates to replace the
built-in emails. Copy `apps/api/src/notification/mail/templates` as a starting
point and keep every file name, since each email looks up its template by name.

---

## Workspace app

### Booting with your additions

`createAppConfig` builds the app's configuration with your routes merged in.
Add your own providers on top with Angular's `mergeApplicationConfig`:

```ts
import { bootstrapApplication } from '@angular/platform-browser';
import { mergeApplicationConfig } from '@angular/core';
import { App, createAppConfig } from './app/extension-api';
import { timeTracking } from 'my-foundry-time-tracking';

bootstrapApplication(
  App,
  mergeApplicationConfig(
    createAppConfig({
      routes: {
        shell: [
          {
            path: 'time',
            title: 'Time - Foundry',
            loadComponent: () => import('./time/time-page').then((m) => m.TimePage),
          },
        ],
      },
    }),
    { providers: timeTracking.providers },
  ),
);
```

- `routes.shell`: signed-in pages rendered inside the app shell.
- `routes.auth`: signed-out pages under `/auth`.

Contributed routes are matched before the built-in ones.

Class-based HTTP interceptors registered under `HTTP_INTERCEPTORS` run after
Foundry's auth interceptor, so they see requests with the session attached.

### Navigation

```ts
provideNavItem({ path: '/time', label: 'Time', icon: 'lucideTimer', order: 35 });
```

Built-in items use `order` 10 (Dashboard) through 100 (Settings) in steps of 10.
Without an `order`, an item goes after Reports and before Settings. Register
the icon at the application level with `provideIcons`.

### Settings tabs

```ts
provideSettingsSection({
  id: 'time',
  label: 'Time tracking',
  icon: 'lucideTimer',
  component: TimeSettings,
});
```

A section whose `id` matches a built-in placeholder tab (for example
`branding`) replaces that placeholder.

### Slots

Slots are named places in the shell that render the components registered for
them:

| Slot                   | Where                                                | Inputs               |
| ---------------------- | ---------------------------------------------------- | -------------------- |
| `shell.sidebar.header` | top of the sidebar, in place of the Foundry wordmark | `collapsed: boolean` |
| `shell.topbar.actions` | top bar, before the notifications menu               | none                 |
| `shell.banner`         | full-width strip above every page                    | none                 |

```ts
provideSlot('shell.banner', MaintenanceNotice);
```

Several components can share a slot. They render in `order`, lowest first.

### Session and workspaces

`AuthService` exposes the signed-in user as a signal, and `authGuard` /
`guestGuard` protect your own routes. `WorkspacesApiService` lists, creates and
updates the caller's workspaces. Together with an interceptor that sets
`x-workspace-id`, it is enough to build a workspace switcher.

---

## Rules for plugin authors

- Never edit Foundry's files; if you need a hook that does not exist, open an
  issue or a pull request describing the plugin use case.
- Keep your data in your own tables. Foundry's migrations own its schema.
- Extension points never gate core workflow; plugins add, they do not take
  away.
