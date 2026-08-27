# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2026-08-28

### Added

- Explicit compatibility with `@resilientmq/core` 2.3.1.
- Native idempotent insertion, exact-status queries, and bulk status updates for
  the Core 2 optimized event-store surface.

### Changed

- Raised the connector package and peer contract to the Core 2 major line.
- Standardized the README with package and runtime badges, compatibility and
  lifecycle references, operational guarantees, architecture, documentation
  navigation, and a dynamically generated contributor gallery.

## [1.0.0] - 2026-08-27

### Added

- Explicit compatibility with `@resilientmq/core` 1.2.12 and Mongoose 8–9.
- Object-oriented `MongooseConnector` lifecycle with reusable publisher and
  graceful consumer, publisher, and MongoDB shutdown.
- Serializer-defined event identity and status paths.
- Idempotent inserts, bounded pending queries, status queries, and bulk updates.
- Real MongoDB integration coverage and enforced unit coverage thresholds.
- OIDC release workflow with npm provenance and no long-lived publication token.

### Fixed

- Removed the invalid required `id` field from the default event model.
- Kept consumer and publisher model and serializer configuration isolated.
- Prevented repeated environment setup from leaking active resources.
- Preserved routing keys and AMQP properties in the default model.

### Changed

- Replaced the per-message publisher connection with a long-lived runtime.
- Replaced Jest and the legacy root-level build output with Vitest and a
  package-scoped `dist` export.
- Raised the runtime requirement to Node.js 20.19.

[Unreleased]: https://github.com/resilientmq/mongoose-connector/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/resilientmq/mongoose-connector/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/resilientmq/mongoose-connector/releases/tag/v1.0.0
