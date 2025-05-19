# @resilientmq/mongoose-connector

Mongoose connector for ResilientMQ, enabling seamless integration with MongoDB using Mongoose.
Handles event storage, status tracking, and serializer support out-of-the-box.

## Table of Contents

- [📦 Installation](#-installation)
- [📚 Purpose](#-purpose)
- [🧩 Main Concepts](#-main-concepts)
- [🔧 Config: MongooseConnectorConfig](#-config-mongooseconnectorconfig)
- [🧩 Custom Event Storage Format](#-custom-event-storage-format)
    - [🔄 Example: Custom Storage Serializer](#-example-custom-storage-serializer)
- [🚀 Example: Consumer](#-example-consumer)
- [🚀 Example: Publisher](#-example-publisher)
- [🧪 Tests](#-tests)
- [Docs](#docs)
- [LICENSE](#license)

## 📦 Installation

```bash
npm install @resilientmq/mongoose-connector
```

## 📚 Purpose

This package acts as a wrapper for the ResilientMQ core logic and provides MongoDB-backed event persistence.

- Automatically injects Mongoose-based `EventStore`
- Manages a singleton DB connection
- Allows full schema customization via serializer

---

## 🧩 Main Concepts

| Feature | Description |
|--------|-------------|
| `setEnvironment(config)` | Initializes Mongo + RabbitMQ settings |
| `consume()` | Starts consumer with Mongo-backed storage |
| `publish(event)` | Publishes using resilient pattern |
| `serializer` | Transforms event ↔ DB formats |
| `singleton` | Keeps one shared MongoDB connection |

---

## 🔧 Config: `MongooseConnectorConfig`

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `mongo.uri` | `string` | ✅ | MongoDB URI |
| `mongo.options` | `ConnectOptions` | ❌ | Optional connection opts |
| `rabbit.consumer` | `Omit<ResilientConsumerConfig, 'store'>` | ❌ | Consumer settings |
| `rabbit.consumer.model` | `Model` | ❌ | Custom Mongoose model |
| `rabbit.consumer.serializer` | `EventSerializer` | ❌ | Custom serializer |
| `rabbit.publisher` | `Omit<ResilientPublisherConfig, 'store'>` | ❌ | Publisher settings |
| `rabbit.publisher.model` | `Model` | ❌ | Custom Mongoose model |
| `rabbit.publisher.serializer` | `EventSerializer` | ❌ | Custom serializer |
| `logLevel` | `'none' \| 'warn' \| 'info' \| 'error'` | ❌ | Logger verbosity |

---

## 🧩 Custom Event Storage Format

Supports pluggable serializers to convert the event to your preferred DB structure.

### 🔄 Example: Custom Storage Serializer

```ts
const serializer = {
  toStorageFormat(event) {
    return {
      _id: event.id,
      body: event.payload,
      customStatus: event.status
    };
  },
  fromStorageFormat(doc) {
    return {
      id: doc._id,
      messageId: doc._id,
      payload: doc.body,
      status: doc.customStatus,
      type: 'custom.type'
    };
  },
  getStatusField() {
    return 'customStatus';
  }
};
```

---

## 🚀 Example: Consumer

```ts
import { setEnvironment, consume } from '@resilientmq/mongoose-connector';

await setEnvironment({
  mongo: {
    uri: 'mongodb://localhost:27017/events'
  },
  rabbit: {
    consumer: {
      connection: 'amqp://localhost',
      consumeQueue: {
        queue: 'my.queue',
        options: { durable: true }
      },
      eventsToProcess: [
        { type: 'my.event', handler: async (payload) => console.log(payload) }
      ]
    },
    publisher: {
      connection: 'amqp://localhost'
    }
  }
});

await consume();
```

---

## 🚀 Example: Publisher

```ts
import { publish } from '@resilientmq/mongoose-connector';

await publish({
  id: 'evt-1',
  messageId: 'msg-1',
  type: 'user.created',
  payload: { name: 'Alice' },
  status: 'PENDING_PUBLICATION'
});
```

---

## 🧪 Tests

- ✅ Unit tested
- ✅ Uses Jest + mocks
- ✅ Compatible with `jest --coverage`

---

## 👥 Contributors

<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%">
        <a href="https://github.com/hector-ae21">
          <img src="https://avatars.githubusercontent.com/u/87265357?v=4" width="100px;" alt="Hector L. Arrechea"/>
          <br /><sub><b>Hector L. Arrechea</b></sub>
        </a>
        <br /><a title="Code">💻</a> <a title="Documentation">📖</a> <a title="Infra">🚇</a> <a title="Tests">⚠️</a>
      </td>
    </tr>
  </tbody>
</table>

---

## 📄 License

[MIT](LICENSE)