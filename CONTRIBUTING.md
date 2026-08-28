# Contributing

Create focused branches from the compatibility line being changed. A change for
core 1 must target `release/core-1.x`; core 2 and core 3 changes target their
matching release branches.

Before opening a pull request, run:

```bash
npm ci
npm run typecheck
npm run test:coverage
npm run build
npm audit --audit-level=high
npm pack --dry-run
```

Store changes require tests for identity, duplicate insertion, state queries,
and custom serializers. Connector 3 changes additionally require concurrent
claim, lease recovery, and stale fencing tests.

Use Conventional Commits. Update the README, compatibility guide, and changelog
when public behavior, supported versions, persistence fields, or deployment
requirements change.
