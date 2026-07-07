# Foundry

Nx 23 npm monorepo. `npm install` requires `--legacy-peer-deps` (express4 vs @nestjs/serve-static peer conflict). Apps: `apps/api` NestJS 11 (webpack build → dist/apps/api/main.js), `apps/client` Angular 21 CSR SPA standalone+signals (spartan-ng, tailwind4, ng-icons/lucide, ngx-echarts), plus api-e2e/client-e2e. No SSR — the app is fully auth-gated with no public/SEO surface, so it ships as a client-rendered SPA.

## Nx

Run tasks through nx (`npx nx build|serve|test|lint <project>`, run-many, affected); never the underlying tool directly. Never guess CLI flags — check `--help` or nx_docs (nx_docs only for advanced/unfamiliar options, not basics). Use nx-workspace skill for workspace exploration; nx-generate skill FIRST for any scaffolding. Plugin best practices: node_modules/@nx/<plugin>/PLUGIN.md when present. Nx MCP server available.

## Prisma

Schema `apps/api/prisma/schema.prisma`; all prisma CLI calls need `--config=apps/api/prisma.config.ts` (or cwd apps/api). Client generated to `apps/api/src/generated/prisma`: model types export as `<Name>Model` (e.g. `ClientModel`), enums in `generated/prisma/enums` are const objects. Decimal columns serialize to string in JSON. Runtime connects via @prisma/adapter-pg in src/prisma/prisma.service.ts (DATABASE_URL, default localhost:5433/foundry). Regenerate after schema edits.

## Docker / just

Dev: `just develop` → docker-compose.local.yml: db 5433, redis 6379 (container foundrycache), mailpit 1025/8025 (UI), api 3000, client 4200; `just studio` (profile tools, 5555); `just migrate "name"`, `just generate`, `just status`, `just reset`; env .env.docker. Prod: `just prod-build|prod-up|prod-down|prod-logs|prod-migrate` → docker-compose.production.yml + .env.production (template .env.production.example). Dockerfile.{api,client}.{local,production} at repo root; api prod image runs prisma migrate deploy then node main.js, hbs templates copied to /app/mail/templates; client prod is a static SPA served by nginx:alpine on port 80 (nginx.conf at repo root) which reverse-proxies /api + /uploads → foundryapi:3000 (runtime DNS via docker resolver 127.0.0.11) and SPA-falls-back to index.html. client:serve dependsOn api:serve — use `--excludeTaskDependencies` to serve alone. Containers mount the repo but tmpfs `/foundry/.nx` — nx's PID-keyed running-task DB must not be shared across host/containers or serve waits on phantom processes. client:serve sets allowedHosts localhost+127.0.0.1 (dev-server hard-400s other Host headers) and proxies /api via proxy.conf.

## API (apps/api/src)

- Global prefix api/v1; Swagger /api/docs (dev only, bearer auth); ValidationPipe whitelist+forbidNonWhitelisted+transform+implicitConversion. Relative imports only (no src/ alias). tsconfig types: node,multer.
- One module per aggregate (module/controller/service + dto/ + entities/): identity/auth, workspaces, clients, projects, invoices, quotes, payments, expenses, documents, notification, events, queues, pdf, storage, prisma, common/pagination.
- Auth: @nestjs/jwt global via AuthModule (JWT_SECRET, JWT_EXPIRES_IN 7d); payload {sub,email,name}; JwtAuthGuard + @CurrentUser(). Signup creates user + default workspace atomically; default workspace = oldest (GET /workspaces/default). forgot/reset-password: 6-digit OTP bcrypt-hashed in user.otpSecret as `hash:expiresMs` (15min TTL), mailed via event auth.password_reset_requested.
- Ownership: queries scoped through workspace.ownerId chain (project→client→workspace etc). Expenses without projectId and documents without client/project are unscoped (schema has no owner link).
- Lists: cursor pagination — PaginationService.paginate(delegate, baseArgs, {cursor,take,orderBy,baseUrl,includeCount}) → {count,next,previous,results}; swagger via ApiPaginatedResponse(Entity); orderBy field must exist on model (projects startDate, payments/expenses date, documents uploadedAt, else createdAt).
- Invoices/quotes: nested items create; update with items replaces all (deleteMany+create); numbers auto-generated INV-/Q-. POST /invoices/:id/send → status sent + event invoice.sent → NotificationService (pdf attachment + hbs mail + ws emit to owner room).
- Notification: MailerModule hbs templates src/notification/mail/templates (invoice-sent, invoice-paid, invoice-reminder, password-reset-otp); handlebars strict — pass every referenced key. Gateway ws namespace /ws/notifications, JWT in handshake auth.token, rooms user:<id>. EventEmitter wildcard enabled; events.gateway rebroadcasts entity.** and file.**.
- pdfmake 0.3: only `const pdfmake = require('pdfmake')` works — exports are this-bound non-enumerable accessors; destructuring or __importStar (import *) break at runtime. setFonts (std-14 Helvetica) then createPdf(def).getBuffer(): Promise<Buffer>.
- Storage: abstract StorageService → local disk (ServeStatic /uploads) or S3 by STORAGE_DRIVER/NODE_ENV. Documents: POST /documents is multipart (multer FileInterceptor 'file' + metadata fields in one call); storageKey/size/mimeType derived server-side, name defaults to the file name; emits file.uploaded; document delete also removes the stored file.
- Env: DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, REDIS_HOST (default foundrycache; set localhost outside docker), REDIS_PORT, SMTP_HOST/PORT/USER/PASS, SEND_EMAIL_FROM, STORAGE_DRIVER, UPLOADS_DIR, PUBLIC_URL, PORT.

## Client (apps/client/src/app)

- core/api/: api.models.ts interfaces mirror API responses (Decimal→string, ISO date strings); per-resource services AuthApiService, WorkspacesApiService, ClientsApiService, ProjectsApiService, InvoicesApiService, QuotesApiService, PaymentsApiService, ExpensesApiService, DocumentsApiService (create(file, meta) posts multipart); base '/api/v1'; authInterceptor (registered in app.config) attaches JWT from ApiTokenStore (localStorage foundry.token.v1) and clears it + redirects to /auth/login on non-auth 401s; apiErrorMessage() flattens Nest error payloads; barrel core/api/index.ts.
- Dev proxy proxy.conf.json → localhost:3000; docker variant proxy.conf.docker.json → foundryapi:3000.
- Auth: core/auth.service.ts wraps AuthApiService (login/signup/refresh via /auth/me, user cached in localStorage foundry.user.v1); routes /auth/login, /auth/signup, /auth/reset (two-step OTP reset). authGuard/guestGuard read the restored session synchronously (appInitializer runs auth.restore() before the router), so protected routes never flash before redirecting.
- Pages fetch data on init and show skeletons while loading (CSR — no server render). Decimal/date coercion helpers live in core/format.ts (num, money, isoDay, toApiDate — Prisma rejects date-only strings, invoiceTotal/quoteTotal); shared/line-items-editor exports LineItemDraft (numeric qty/rate) mapped to/from string API items.

## Conventions

Use domain-driven design. Code is reviewed by codex. Entities/DTOs carry full @ApiProperty metadata; every endpoint documents its response types.
