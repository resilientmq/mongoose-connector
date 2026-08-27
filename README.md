# @resilientmq/mongoose-connector

<!-- Package -->
[![npm version](https://img.shields.io/npm/v/@resilientmq/mongoose-connector.svg?logo=npm)](https://www.npmjs.com/package/@resilientmq/mongoose-connector)
[![CI](https://img.shields.io/github/actions/workflow/status/resilientmq/mongoose-connector/ci.yml?branch=release%2Fcore-2.x&logo=github&label=CI)](https://github.com/resilientmq/mongoose-connector/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

<!-- Runtime -->
[![Node.js](https://img.shields.io/badge/Node.js-20.19%20%7C%2022%20%7C%2024-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Mongoose](https://img.shields.io/badge/Mongoose-8%20%7C%209-880000?logo=mongoose&logoColor=white)](https://mongoosejs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-8-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![ResilientMQ core](https://img.shields.io/badge/ResilientMQ_core-2.x-5C2D91)](https://www.npmjs.com/package/@resilientmq/core)

> Durable MongoDB inbox and outbox persistence for
> [`@resilientmq/core`](https://www.npmjs.com/package/@resilientmq/core), with
> Mongoose models, idempotent insertion, bounded backlog reads, and reusable
> RabbitMQ runtimes.

```ts
const connector = new MongooseConnector(config);
await connector.startConsumer();
await connector.publish(event);
```

---

## Table of contents

- [Features](#features)
- [Compatibility](#compatibility)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Delivery model](#delivery-model)
- [Connector lifecycle](#connector-lifecycle)
- [Event store](#event-store)
- [Custom models and serialization](#custom-models-and-serialization)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Version lines](#version-lines)
- [Development](#development)
- [Documentation](#documentation)
- [Contributors](#contributors)
- [License](#license)

---

## Features

- **Durable inbox and outbox** — persists ResilientMQ event state in MongoDB.
- **Idempotent insertion** — converts MongoDB duplicate-key conflicts into a
  deterministic `false` result.
- **Efficient backlog processing** — bounded, oldest-first pending queries and
  one-call `bulkWrite` status transitions.
- **Reusable connections** — one object-oriented runtime shares MongoDB and
  long-lived RabbitMQ consumer and publisher resources.
- **Independent stores** — consumer and publisher models and serializers never
  leak into each other.
- **Custom persistence** — applications may provide their own Mongoose model,
  identity filter, status field, and serialization format.
- **Safe shutdown** — RabbitMQ runtimes stop before the shared MongoDB
  connection is closed.
- **Typed API** — ESM package with generated TypeScript declarations.

## Compatibility

Install the connector major matching the `@resilientmq/core` major:

| Connector | ResilientMQ core | Mongoose | Node.js | Ownership model |
| --- | --- | --- | --- | --- |
| 1.x | `^1.2.12` | 8.x–9.x | 20.19, 22, 24 | Durable CRUD and deduplication |
| 2.x | `^2.3.1` | 8.x–9.x | 20.19, 22, 24 | Idempotent batch operations |
| 3.x | `^3.0.0` | 8.x–9.x | 20.19, 22, 24 | Atomic leases and fencing |

This branch builds connector 2.x for the latest core 2.x contract. It uses the
idempotent insertion, status query, and batch update operations added by Core 2.
Core 2 still does not expose the leases and fencing required to coordinate
ownership after a process failure. Applications requiring replica-safe claims
must use core and connector 3.x together.

Every supported Node.js line, the declared core peer dependency, Mongoose, and
a real MongoDB 8 service are exercised by CI.

## Installation

```bash
npm install @resilientmq/core@^2.3.1 mongoose @resilientmq/mongoose-connector@^2
```

## Quick start

Prefer one `MongooseConnector` per application process:

```ts
import {randomUUID} from 'node:crypto';
import {MongooseConnector} from '@resilientmq/mongoose-connector';

const connector = new MongooseConnector({
  mongo: {
    uri: process.env.MONGODB_URL!
  },
  rabbit: {
    consumer: {
      connection: process.env.AMQP_URL!,
      consumeQueue: {
        queue: 'orders.events',
        options: {durable: true}
      },
      eventsToProcess: [{
        type: 'order.created',
        handler: async event => processOrder(event.payload)
      }]
    },
    publisher: {
      connection: process.env.AMQP_URL!,
      exchange: {
        name: 'domain.events',
        type: 'topic',
        options: {durable: true}
      }
    }
  }
});

await connector.startConsumer();
await connector.publish({
  messageId: randomUUID(),
  type: 'order.accepted',
  routingKey: 'order.accepted',
  payload: {orderId: 'order-42'},
  status: 'PENDING_PUBLICATION'
});

process.once('SIGTERM', () => {
  void connector.disconnect();
});
```

The connector opens MongoDB lazily, creates each RabbitMQ runtime once, and
reuses the publisher across calls. It does not connect and disconnect for every
event.

## Delivery model

- MongoDB provides durable event state and a unique message identity.
- Duplicate inserts are rejected by the database rather than by an unsafe
  read-before-write check.
- Pending publication reads are ordered by creation time and explicitly
  bounded.
- RabbitMQ and MongoDB do not participate in one distributed transaction.
- Message handlers and external domain effects must therefore remain
  idempotent.

Connector 2.x prevents duplicate persisted identities and reduces status-update
round trips, but it cannot offer the
atomic lease recovery and stale-owner fencing introduced by core 3.x. The
[compatibility guide](docs/compatibility.md) documents this distinction in
detail.

## Connector lifecycle

`MongooseConnector` owns the runtimes it creates while retaining one shared
MongoDB connection:

| Method | Behavior |
| --- | --- |
| `connect()` | Opens MongoDB if it is not already connected. |
| `createConsumer()` | Lazily creates and reuses the configured consumer. |
| `startConsumer()` | Connects MongoDB and starts the consumer. |
| `createPublisher()` | Lazily creates and reuses the configured publisher. |
| `publish(event, options?)` | Connects MongoDB and publishes through the reusable publisher. |
| `disconnect()` | Stops consumer and publisher, then closes MongoDB. |

Existing applications can retain the functional compatibility facade:

```ts
import {
  consume,
  disconnect,
  publish,
  setEnvironment
} from '@resilientmq/mongoose-connector';

await setEnvironment(config);
await consume();
await publish(event);
await disconnect();
```

The facade delegates to the same reusable connector lifecycle.

## Event store

`GenericMongooseStore` implements the full core 2.x `EventStore` contract:

| Operation | MongoDB behavior |
| --- | --- |
| `saveEvent` | Creates one event document. |
| `saveEventIfNotExists` | Uses the unique index and handles error `11000`. |
| `getEvent` / `deleteEvent` | Uses the serializer-defined identity filter. |
| `updateEventStatus` | Updates the serializer-defined status path. |
| `getPendingEvents` | Returns a bounded, oldest-first batch. |
| `getEventsByStatus` | Returns events matching an exact status. |
| `batchUpdateEventStatus` | Applies transitions through one `bulkWrite`. |

The default model persists `messageId`, `type`, `payload`, `status`,
`routingKey`, and AMQP `properties`. Default indexes cover message identity and
pending status scans.

## Custom models and serialization

Consumer and publisher stores accept independent `model`, `modelName`, and
`serializer` settings. A custom serializer must match its model and define the
identity filter whenever the event ID is not stored at `messageId`:

```ts
import type {EventSerializer} from '@resilientmq/mongoose-connector';

const serializer: EventSerializer = {
  toStorageFormat: event => ({
    _id: event.messageId,
    body: event.payload,
    lifecycle: event.status
  }),
  fromStorageFormat: document => ({
    messageId: String(document._id),
    payload: document.body,
    status: String(document.lifecycle)
  }),
  getIdentityFilter: event => ({_id: event.messageId}),
  getStatusField: () => 'lifecycle'
};
```

Serializer objects must be stateless or safe for concurrent calls.

## Configuration

```ts
new MongooseConnector({mongo, rabbit, logLevel});
```

| Option | Required | Description |
| --- | :---: | --- |
| `mongo.uri` | Yes | MongoDB connection URI. |
| `mongo.options` | No | Application-specific Mongoose connection options. |
| `rabbit.consumer` | No | Core consumer configuration plus optional store customization. |
| `rabbit.publisher` | No | Core publisher configuration plus optional store customization. |
| `rabbit.*.model` | No | Existing application-owned Mongoose model. |
| `rabbit.*.modelName` | No | Name used when creating the default model. |
| `rabbit.*.serializer` | No | Serializer matching the selected model. |
| `logLevel` | No | `none`, `warn`, `info`, or `error`. |

The application supplies at least the RabbitMQ runtime it intends to use.
Calling a consumer or publisher method without its matching configuration fails
immediately with a descriptive error.

## Architecture

```text
Application
  └─ MongooseConnector
      ├─ ResilientConsumer ── GenericMongooseStore ── consumer model
      ├─ ResilientPublisher ─ GenericMongooseStore ── publisher model
      └─ MongoConnection ───────────────────────────── MongoDB
```

The connector separates RabbitMQ runtime ownership from persistence mapping.
Both stores share the MongoDB connection, while their models and serializers
remain isolated.

## Version lines

The connector majors are maintained as sequential compatibility branches:

| Branch | Package line | Purpose |
| --- | --- | --- |
| `release/core-1.x` | 1.x | Latest core 1.x CRUD contract. |
| `release/core-2.x` | 2.x | Core 2 batch and idempotent store contract. |
| `release/core-3.x` | 3.x | Atomic inbox/outbox leases and fencing. |

Upgrade one major at a time. The peer dependency deliberately rejects unsupported
core/connector combinations instead of allowing a resilience contract to degrade
silently.

## Development

```bash
npm ci
npm run typecheck
npm run test:coverage
npm run build
npm audit --audit-level=high
npm pack --dry-run
```

Run the real MongoDB integration suite with:

```bash
MONGODB_URL=mongodb://localhost:27017/resilientmq npm run test:integration
```

CI validates Node.js 20.19, 22, and 24, enforces at least 90% statement, line,
and function coverage plus 80% branch coverage, and exercises MongoDB 8.

## Documentation

- [Compatibility and release guarantees](docs/compatibility.md)
- [Changelog](CHANGELOG.md)
- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [CI and trusted publishing](.github/workflows/README.md)

## Contributors

Thanks to everyone who has contributed to this project:

[![Contributors](https://contrib.rocks/image?repo=resilientmq/mongoose-connector)](https://github.com/resilientmq/mongoose-connector/graphs/contributors)

Want to help? Read [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © [ResilientMQ](https://github.com/resilientmq)
