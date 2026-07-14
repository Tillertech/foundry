# Contributing to Foundry

Thanks for considering a contribution. Foundry is built by Tillertech to
solve a problem I hit myself running a consultancy, and it stays useful
only because the people using it push it forward. This document covers
what you need to know before opening an issue or a pull request - the
license, the feature-line policy, and how contributions actually get
reviewed.

Read the sections that apply to what you're planning to do. If you're
opening an issue, the "Reporting bugs and requesting features" section
is enough. If you're opening a PR, read the license and CLA section
first.

---

## License

Foundry Community is licensed under **AGPL-3.0-or-later** (AGPLv3).

The full license text is in [`LICENSE`](./LICENSE). The short version:

- You can run Foundry for your own business, modify it, and deploy it on
  your own infrastructure - without restriction, without notifying us,
  without paying anything.
- You can fork it, extend it, and distribute your modifications, as long
  as those modifications are also licensed under AGPLv3.
- If you modify Foundry and offer the modified version as a network
  service to others (for example, hosting a modified Foundry as a SaaS),
  AGPL requires you to publish your modifications under the same
  license.
- For internal use by your own business - even by a large team -
  AGPL imposes no obligations you would notice in day-to-day operation.

If you are unsure how AGPL applies to your situation, ask before
building on it. We would rather answer a question up front than have a
contributor discover the constraint later.

Tillertech separately maintains proprietary code (`foundry-ee` and
`foundry-cloud`) that is not part of this repository and is not covered
by AGPLv3. That code is not accepted as a contribution to this project.
This repository is Community only.

---

## What belongs in Community vs. Cloud

This is the question that comes up most often before someone starts
building, and it saves time to answer it up front.

**The test.** If a feature is part of the client-to-cash lifecycle
(Clients - Quotes - Projects - Invoices - Payments - Documents), it
belongs in Community. No exceptions, no future re-litigation. If a
feature is about administration, compliance, multi-party access, or
operating at scale, it belongs in the commercial Cloud offering and
should not be built in this repository.

**Community owns:**

- Clients, Quotes, Projects, Invoices, Payments, Expenses, Documents
- Basic reporting and dashboards
- Recurring invoicing and retainer billing
- Time tracking against projects
- Multi-currency invoicing with VAT/GST handling
- Document branding on outbound documents (logo, name, colors, business
  details)
- Realtime in-app notifications
- REST API - read/write access to your own data
- Plugin architecture and extension hooks - third parties can build and
  distribute plugins for Community
- CSV/JSON import and export of all data
- E-signature acceptance on quotes
- Basic client-facing portal (view and download quotes and invoices via
  tokenized links)
- Online payment collection on invoices (Stripe, direct)

**Cloud owns (not this repository):**

- SSO (SAML/OIDC) and SCIM provisioning
- RBAC beyond a basic owner/viewer split
- Immutable audit log
- Multi-workspace management
- Advanced template designer (build layouts from scratch)
- Full interactive client portal with quote acceptance workflow,
  document exchange, and messaging
- Automation engine - conditional multi-step workflow rules
- Outbound webhooks and API keys for third-party integrations at scale
- White-label (hide that Foundry is the vendor)
- Approval workflows
- Managed hosting, backups, monitoring
- Priority support and SLA

**The grey-area rule.** When a feature is not obviously one or the
other: does it serve one person running their own business, or does it
serve coordinating across a team, multiple parties, or a regulatory
requirement? First case belongs in Community. Second case belongs in
Cloud and should not be contributed here.

**The standing promise.** The client-to-cash lifecycle stays free,
unlimited, and actively developed in Community - permanently. A new
lifecycle feature never triggers a "which tier does this go in"
negotiation. Community does not get worse to sell Cloud.

If you have a feature idea and are not sure which side it falls on,
open a discussion issue before you start building. Getting it wrong
after a week of work is the outcome we most want to help you avoid.

---

## Reporting bugs

Before filing:

- Search existing issues to check whether it has already been reported.
- Confirm the bug is in the latest release; if you are running an older
  version, upgrade first and see whether it reproduces.
- If it involves a specific data condition, try to reproduce it from a
  clean install.

When you file, include:

- Foundry version (`docker inspect` on the image tag is fine).
- Deployment context - Docker Compose on a VPS, on-prem, air-gapped,
  etc.
- Postgres and Redis versions if you have customized them.
- What you did, what you expected, what actually happened.
- Relevant logs (`docker compose logs api`) with sensitive information
  scrubbed.
- If the bug is UI-related, a screenshot or a short screen recording.

Do not include real client data or invoice contents in bug reports.
Sanitized examples are always fine.

---

## Requesting features

Feature requests are welcome. Two things to check first:

1. Read the "What belongs in Community vs. Cloud" section above. If
   what you are asking for is a Cloud feature (SSO, audit log, RBAC,
   etc.), the answer is "not in this repository" - but tell us anyway,
   because that is exactly the signal that helps decide when to build
   a self-hosted Enterprise SKU.
2. Search existing feature request issues. If one exists, add your use
   case rather than opening a duplicate. Real use cases from real
   businesses are what actually move a feature up the priority list.

When requesting a feature, describe:

- What you are trying to accomplish (the actual workflow, not the
  feature name).
- What you currently do instead, and where it breaks down.
- Why the existing feature set does not solve it.

Feature requests without a workflow context are hard to prioritize.
"Add X because Y competitor has it" is not a use case; "I need to bill
retainers across three currencies for a client that flips between
project-based and hourly, and here is how I currently do it" is.

---

## Security disclosure

If you find a security vulnerability, **do not open a public issue.**

Email `hello@tillertech.io` with:

- A description of the vulnerability.
- Reproduction steps.
- The affected version(s) if you can identify them.
- Your name and how you would like to be credited (or "anonymous").

We will acknowledge within 7 days. We do not currently offer a bug
bounty program, but confirmed reports get credit in the release notes
for the fix, and Tillertech reserves the right to send you something as
a thank-you.

Please give us reasonable time to ship a fix before disclosing
publicly. If a fix is not shipping in a timeframe you consider
reasonable, tell us that directly - we would rather negotiate a
disclosure timeline than have you publish out of frustration.

---

## Development setup

You will need:

- Node.js 20 LTS or newer
- pnpm 9 or newer
- Docker and Docker Compose (for Postgres, Redis, and optional local S3)
- A Postgres 15+ instance (Docker Compose brings one up locally)

Setup:

```bash
git clone https://github.com/tillertech/foundry
cd foundry
npm install
cp .env.docker.example .env.docker
docker compose -f docker-compose.local.yml up -d
```

The client runs on `http://localhost:4200` and the API on
`http://localhost:3000`.

If any of those commands fail on a clean clone, that itself is a
reportable bug - first-run experience matters more than most bugs, and
we want to hear about it.

---

## Pull request workflow

**Before you write code:**

- For a bug fix under ~50 lines, just open the PR - no issue needed.
- For anything larger, open an issue first and get a signal from a
  maintainer that the direction is welcome. This is not a formality;
  it saves you from writing a week of code that gets closed for a
  reason that could have been discussed in ten minutes.
- If you are adding a dependency, mention it in the issue. New
  dependencies are a real cost and often not the right call.
- If your change touches the schema, mention it in the issue. Schema
  changes are additive-only in Foundry and go through more careful
  review.

**When you open the PR:**

- Reference the issue it addresses (`Closes #123` or `Refs #123`).
- Keep the PR focused - one logical change per PR. Two unrelated fixes
  should be two PRs.
- Include a short "what changed and why" in the description. Not a
  novel; a paragraph.
- If it is a UI change, include a screenshot before/after.
- Make sure the CI passes locally before you push
  (`pnpm nx run-many -t lint test`).

**What we look for in review:**

- Does it match the module boundary rules? Core code cannot import
  from `libs/ee/*`. The lint rule enforces this, but reviewers will
  also check.
- Does it follow existing patterns in the codebase? Consistency is
  worth more than local elegance.
- Is it tested? Not every change needs a test, but changes to the
  quote/invoice/payment logic almost always do.
- Is the commit history clean? Squash noisy WIP commits before we
  merge.

**Review timelines:** aim to acknowledge within a week, first
substantive review within two weeks. If a PR sits without a response
for longer than that, ping the issue - it has slipped through, not
been ignored.

---

## Code style

- TypeScript strict mode is on. Do not relax it locally.
- ESLint and Prettier configs live at the root and are what we run in
  CI. Do not fight them.
- Use existing Nx generators for new libs, controllers, and modules -
  do not hand-create the folders. This keeps tags and boundary rules
  correct from the start.
- Prefer smaller, well-named files over large ones. Public exports
  from each lib go through the `index.ts` barrel.

---

## What we do not accept

Being direct so nobody wastes time:

- Contributions to Cloud/Enterprise features (see the boundary section
  above). Even good code for an SSO integration or an audit log is out
  of scope for this repository. If you want to build one of these,
  reach out and we can discuss whether a self-hosted Enterprise SKU is
  something we should be working on together.
- Contributions that reshape the schema breakingly. All schema changes
  are additive. Migrations remove tables only through a deprecation
  cycle that takes at least one major release.
- Contributions that add telemetry or "phone home" behavior of any
  kind. Foundry runs offline by design; this is not negotiable.
- Contributions that introduce dependencies without a real
  justification. Every added dependency is future maintenance for
  everyone.
- Drive-by rewrites of significant subsystems without a prior
  discussion issue. Not because we don't want the improvement, but
  because a rewrite that lands without prior conversation almost
  always misses context that a five-minute discussion would surface.

---

## A note on tone

Public issues, discussions, and PR reviews all follow the same rule:
be direct, be specific, be kind. Direct honesty is more useful than
padded feedback; specifics are more useful than gestures; kindness is
what makes the first two land.

Push back on decisions you think are wrong - including decisions I
made. If you think a feature is in the wrong tier, if you think the
architecture is off, if you think the roadmap is missing something
important, say so. This project gets better when someone catches a
contradiction I missed.

That goes in both directions. If a maintainer pushes back on your PR,
it is about the code, not you. If it feels otherwise, tell us -
directly - and we will fix it.

---

## Questions

- General discussion: GitHub Discussions on this repo.
- Bug reports: GitHub Issues on this repo.
- Anything about Cloud, licensing, or commercial arrangements:
  `hello@tillertech.io`.

Thanks for reading this far. If you are about to open your first issue
or PR, welcome - Foundry is more useful because you are here.

- Marvin Kweyu, Tillertech
