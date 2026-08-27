# @resilientmq/mongoose-connector

MongoDB persistence for the inbox and outbox contracts in `@resilientmq/core`,
implemented with Mongoose.

This `1.x` release line targets the latest ResilientMQ core 1.x contract. It
provides durable event state, idempotent inserts, bounded pending queries, and a
long-lived object-oriented runtime that shares MongoDB and RabbitMQ resources.

## Compatibility

| Connector | ResilientMQ core | Mongoose | Node.js |
| --- | --- | --- | --- |
| 1.x | `^1.2.12` | 8.x–9.x | 20.19, 22, 24 |
| 2.x | `^2.3.1` | 8.x–9.x | 20.19, 22, 24 |
| 3.x | `^3.0.0` | 8.x–9.x | 20.19, 22, 24 |

Install the connector major matching the core major used by the application.
Core 3 requires atomic leases and fencing and is implemented only by connector
3.x; upgrading core without upgrading the connector is unsupported.

## Installation

```bash
npm install @resilientmq/core@^1.2.12 mongoose @resilientmq/mongoose-connector@^1
```

## Quick start

Prefer one `MongooseConnector` per application process:

```ts
import {MongooseConnector} from '@resilientmq/mongoose-connector';

const connector = new MongooseConnector({
  mongo: {
    uri: process.env.MONGODB_URL!
  },
  rabbit: {
    consumer: {
      connection: process.env.AMQP_URL!,
      consumeQueue: {queue: 'orders.events', options: {durable: true}},
      eventsToProcess: [{
        type: 'order.created',
        handler: async event => processOrder(event.payload)
      }]
    },
    publisher: {
      connection: process.env.AMQP_URL!,
      exchange: {name: 'domain.events', type: 'topic', options: {durable: true}}
    }
  }
});

await connector.startConsumer();
await connector.publish({
  messageId: crypto.randomUUID(),
  type: 'order.accepted',
  routingKey: 'order.accepted',
  payload: {orderId: 'order-42'},
  status: 'PENDING_PUBLICATION'
});

process.once('SIGTERM', async () => {
  await connector.disconnect();
});
```

The connector opens MongoDB lazily, reuses one publisher, and closes RabbitMQ
before MongoDB during shutdown. It never creates and disconnects a RabbitMQ
publisher for every event.

## Functional compatibility facade

Existing applications can retain the functional API. `publish` now reuses the
configured publisher; call `disconnect` during application shutdown.

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

## Event store

`GenericMongooseStore` implements the core 1.x contract and also exposes the
optional idempotent and batch operations used by later core 2.x releases:

- unique insert through `saveEventIfNotExists`;
- serializer-defined identity and status paths;
- oldest-first bounded `getPendingEvents` queries;
- `getEventsByStatus` and one-call `bulkWrite` status updates;
- default indexes for message identity and pending scans.

The default model stores `messageId`, `type`, `payload`, `status`, `routingKey`,
and AMQP `properties`. The application can inject separate consumer and
publisher models with `rabbit.consumer.model` and `rabbit.publisher.model`.

## Custom serialization

A custom serializer must match its custom model and should define its identity
filter when the message ID is not stored at `messageId`:

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

Configure the serializer independently for the inbox and outbox. Serializer
objects must be stateless or safe for concurrent calls.

## Version lines

The three connector majors are maintained as sequential compatibility branches:

| Branch | Package line | Purpose |
| --- | --- | --- |
| `release/core-1.x` | 1.x | Latest core 1.x compatibility. |
| `release/core-2.x` | 2.x | Core 2 batch and idempotent store contract. |
| `release/core-3.x` | 3.x | Atomic inbox/outbox leases and fencing. |

See [docs/compatibility.md](docs/compatibility.md) before changing major lines.

## Development

```bash
npm ci
npm run typecheck
npm run test:coverage
npm run build
npm audit --audit-level=high
npm pack --dry-run
```

Set `MONGODB_URL` to run the real MongoDB integration suite:

```bash
MONGODB_URL=mongodb://localhost:27017/resilientmq npm run test:integration
```

CI validates Node.js 20.19, 22, and 24, enforces at least 90% statement, line,
and function coverage plus 80% branch coverage, and runs real MongoDB tests.

## License

MIT
