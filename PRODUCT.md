# Product

## Register

product

## Platform

web

## Users

Primary: Titan staff across roles (`titan.owner`, `titan.finance`, `titan.revenue`,
`titan.operations`, `titan.support`, `titan.field`) running the day-to-day operation from the
cockpit — dense, multi-tasking, multi-hour sessions covering reservations, pricing, distribution,
financial/fiscal closing, cleaning oversight, and approvals. Secondary: property owners checking
performance and payout statements in the Owner Portal, and vendors accepting and executing work
orders through the Vendor Portal, both on mobile as often as desktop. Guests are served by a
separate, brand-register surface (the storefront/guest area) and are not this surface's primary
user.

## Product Purpose

A self-hosted platform for Titan Empreendimentos' short-term-rental operation: reservations
across direct and OTA channels, a double-entry financial ledger, Brazilian fiscal (NFS-e)
compliance, photo-evidence-audited housekeeping and maintenance, and AI-agent-assisted pricing
and operations — all constrained by ten non-negotiable invariants (see `docs/invariantes.md`).
Success looks like: zero double-bookings, zero unapproved payouts, zero damage claims lost to a
missed channel deadline, and staff able to run the entire operation from one dense, trustworthy
cockpit rather than a spreadsheet plus a dozen disconnected tools.

## Positioning

Agent-augmented, human-gated: AI agents draft and propose across pricing, operations, and guest
messaging, but every action with financial or fiscal consequence requires a recorded human
confirmation. Automation without losing control.

## Brand Personality

Professional, transparent, efficient. The cockpit should feel like the tool of a disciplined
operator, not a consumer app or a sales dashboard — confident in the numbers it shows because
every one of them traces back to an auditable source, plain about what an agent did versus what
a person did, and fast to scan across a 20-route, 8-hour shift.

## Anti-references

- A cheap Airbnb-clone template — unstyled open-source rental script or no-code/Bubble look.
- A cold enterprise spreadsheet tool — dense grey grids and SAP-style forms, despite being
  genuinely data-heavy.
- A consumer social/lifestyle app — no stories/reels-style affordances; playful consumer
  patterns undercut the financial-trust tone this product needs.
- Carried up from ADR-0016 because they shape product feel, not just visuals: glow/glassmorphism
  behind data, hachured bars on real-value series, oversaturated multi-gradient KPI cards.

## Design Principles

1. **Numbers are provably correct, not just usually correct.** Any screen showing money,
   occupancy, or unit state must trace back to an auditable source — a ledger entry, a DB
   constraint, a hash-chained evidence record — never a value the UI alone asserts.
2. **The model proposes, the human decides.** Any agent-touched surface visibly labels the
   actor (`agent:concierge v1.4` vs. a person's name) and never auto-executes a financial or
   fiscal action.
3. **Density serves the 8-hour shift.** The cockpit optimizes for staff running the same
   screens all day, not for a first impression — compact rows by default, comfortable as an
   alternative, `cmdk` as an accelerator for power users.
4. **Absence of a button is not security.** Every visible affordance already reflects the
   actual server-side authorization; nothing is hidden client-side that the API would still
   allow.
5. **Evidence over trust.** Cleaning, damage, and deposit decisions show provenance — assurance
   level, hash chain, timestamp — rather than asking anyone to take a photo's word for it.

## Accessibility & Inclusion

WCAG 2.2 AA is a hard CI gate (`axe-core`), verified per component in Storybook — not
aspirational. Particular emphasis: color is never the sole status signal (a `StatusPill` always
pairs color with text); 4.5:1 minimum contrast on all body text and tabular figures; large touch
targets and glove-compatible interaction for the field app and vendor portal, both used outdoors
and sometimes one-handed.
