## Summary

<!-- Describe the compatibility problem and resulting behavior. -->

## Target line

- [ ] Core 1.x / connector 1.x
- [ ] Core 2.x / connector 2.x
- [ ] Core 3.x / connector 3.x

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Refactor
- [ ] Documentation

## Verification

- [ ] `npm run typecheck`
- [ ] `npm run test:coverage`
- [ ] `npm run test:integration`
- [ ] `npm run build`
- [ ] `npm audit --audit-level=high`
- [ ] `npm pack --dry-run`

## Persistence checklist

- [ ] Message identity and duplicate insertion are covered.
- [ ] Custom model and serializer behavior are covered.
- [ ] Pending queries remain bounded and oldest-first.
- [ ] Connection and shutdown resources are not leaked.
- [ ] Core peer range, README, compatibility guide, and changelog match.
- [ ] Core 3 changes include concurrent claim, lease recovery, and stale fencing coverage.

## Related issue

<!-- Link a related issue when one exists. Use N/A otherwise. -->

Closes #
