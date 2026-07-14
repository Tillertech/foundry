<p align="center">
  <h2 align="center"><a href="https://foundry.tillertech.io/">Foundry</a></h2>
  <p align="center">The open-source workspace for consultants, agencies and studios</p>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPLv3-blue.svg" alt="License: AGPLv3"></a>
  <img src="https://img.shields.io/badge/self--hosted-yes-success" alt="Self-hosted">
  <img src="https://img.shields.io/badge/docker-ready-blue" alt="Docker ready">
  <a href="https://foundry.tillertech.io/"><img src="https://img.shields.io/badge/website-foundry.tillertech.io-orange" alt="Website"></a>
</p>

![Foundry](./images/preview.png)

Foundry manages the full client-to-cash lifecycle - clients, quotes, projects, invoices, payments and documents - as one workspace on your own infrastructure. No row limits, no per-seat pricing, no telemetry.

---

## Table of contents

- [Table of contents](#table-of-contents)
- [Why Foundry](#why-foundry)
- [Features](#features)
- [Community, Cloud \& Enterprise](#community-cloud--enterprise)
- [Quick start (Docker)](#quick-start-docker)
- [Architecture](#architecture)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Why Foundry

I was tired of using multiple tools and possible subscriptions to get a consulting business to work - clients, projects, invocing, payments logging, fragmented documents, reports.

Foundry is what you get when someone who ran into all of that decides to build the tool they actually wanted. It runs on your own
infrastructure, keeps the full workflow in one place, and stays free forever for self-hosters - because that's the version I use myself.

For the longer story:
[Why I built Foundry](https://www.marvinkweyu.net/indulge/the-lifecycle-i-was-billing-against).

---

## Features

- **Clients** - every relationship in one timeline: quotes, projects,
  invoices, payments and documents in context.
- **Projects** - the center of the workflow. Scope, timeline, documents
  and invoices all hang off the project.
- **Quotes** - professional, numbered quotes with real line items. When
  the client accepts, the project starts. Nothing retyped.
- **Invoices** - auto-numbered, PDF-generated, emailed and tracked from
  draft to paid.
- **Payments & expenses** - record payments against invoices, expenses
  against projects. Outstanding balances and real margins, always
  current.
- **Documents** - contracts, briefs and deliverables attached to the
  client and project they belong to. Local disk or any S3-compatible
  storage.
- **Realtime dashboard** - revenue, outstanding invoices and activity,
  updated live as events happen.
- **Event-driven core** - every action emits an event; automation and
  extensions hook into the same bus.

Full workflow. No row limits. No feature gates on core lifecycle.

---

## Community, Cloud & Enterprise

Foundry is open-core: the workflow that runs your business is free forever, and the layer that only matters when you scale across teams is paid.

**Community** - free, self-hosted, open source (AGPLv3). Full client-
to-cash lifecycle, no row limits, no telemetry, no feature gates. This
repository.

**Cloud** *(in development, join the waitlist)* - Foundry hosted and operated by Tillertech. Everything Community does, plus SSO, RBAC,
audit logs, multi-workspace management, an interactive client portal,
managed backups and monitoring.

**Self-hosted Enterprise** - considering it. If your organization needs the Cloud feature set on your own infrastructure (for compliance, air-gap, or contractual reasons), reach out at [hello@tillertech.io](mailto:hello@tillertech.io). We'd rather ship it because someone needs it than sell it speculatively.

See the [feature boundary policy](./CONTRIBUTING.md#what-belongs-in-community-vs-cloud) in `CONTRIBUTING.md` for the full list.

---

## Quick start (Docker)

Foundry runs on any host that can run Docker. You need about 2GB of RAM to start.

**Prerequisites**

- Docker 24 or newer
- Docker Compose v2 (bundled with recent Docker installs)

**Install**

```sh
mkdir foundry && cd foundry
curl -L -o docker-compose.yml https://raw.githubusercontent.com/tillertech/foundry/main/docker-compose.production.yml
curl -L -o .env https://raw.githubusercontent.com/tillertech/foundry/main/.env.production.example
# Edit .env - set DATABASE_URL, JWT_SECRET, and your S3 credentials
nano .env
docker compose up -d
```

Foundry will be running at `http://localhost:3000`. On first run, create your admin account at `/register`.

**Where your data lives**

- Postgres data: `./volumes/postgres`
- Uploaded documents: your configured S3-compatible bucket (or
  `./volumes/uploads` if using local storage)
- Redis: ephemeral, safe to lose

**Updating**

```sh
docker compose pull
docker compose up -d
```

Migrations run automatically on startup. Additive-only - your data is never reshaped.


---

## Architecture

Boring, proven infrastructure - the kind you can operate at 11pm without surprises.

- **API** - NestJS, Prisma, event-driven modular monolith
- **Client** - Angular with SpartanNG **(* finally :) **)** + Tailwind
- **Database** - PostgreSQL
- **Cache & queues** - Redis with BullMQ
- **Object storage** - any S3-compatible provider (Cloudflare R2, Backblaze B2, AWS S3, MinIO)
- **Deployment** - Docker Compose on a single VPS, or split across hosts as you scale

Monorepo managed with Nx. Module boundaries enforced by ESLint so core lifecycle code can never depend on the commercial layer.

More on the architecture: `docs/architecture.md` *(work in progress)*.

---

## Roadmap

**Shipped**

- Clients & projects
- Quotes & invoices
- Payments & expenses
- Documents & file storage (S3-compatible)
- Realtime notifications
- REST API
- Basic reporting dashboard

**Next (Community)**

- Basic client-facing portal (view/download)
- Recurring invoices / retainers
- Time tracking against projects
- CSV/JSON import & export
- Document branding (logo, colors, business details)
- E-signature acceptance on quotes
- Public plugin & extension API

**Next (Cloud)**

- Managed hosting, backups, monitoring
- RBAC - Owner/Admin/Finance/PM/Viewer
- SSO - SAML/OIDC & SCIM
- Immutable audit log
- Outbound webhooks
- Multi-workspace management
- Advanced template designer
- Full interactive portal with payment collection
- White-label & custom domain

See [foundry.tillertech.io](https://foundry.tillertech.io/#roadmap) for the current state.

---

## Contributing

Bug reports, feature requests and pull requests are welcome - please read [CONTRIBUTING.md](./CONTRIBUTING.md) first. It covers:

- The AGPLv3 license for pull requests
- What belongs in Community vs. what's out of scope here
- The development setup and pull request workflow

Local development setup, code style, and Nx generator commands are all documented there.

---

## License

Foundry Community is licensed under [AGPL-3.0-or-later](./LICENSE).

**Short version:** you can run, modify and self-host Foundry without
restriction. If you modify it and offer the modified version as a
network service to others, AGPL requires you to publish your
modifications. For internal use by your own business, there are no
obligations you'll notice.

---

Built by [Tillertech](https://www.tillertech.io)

**PS:**
Some pieces of the docs are a work in progress... as the project is