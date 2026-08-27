# Compatibility and release lines

The connector major follows the `@resilientmq/core` major. Each published line
has an explicit peer dependency so npm rejects unsupported combinations instead
of allowing a runtime mismatch.

## Core 1 and connector 1

Core 1 uses the original `EventStore` CRUD contract. Deferred publishing also
requires `getPendingEvents`. Connector 1 provides that contract, unique MongoDB
message IDs, idempotent insertion, and optional batch methods.

Core 1 does not pass stable service identity, process identity, leases, or
fencing tokens to a store. This line therefore supports durable deduplication
but cannot safely coordinate ownership of the same event across competing
replicas after a process failure.

## Core 2 and connector 2

Core 2 adds `saveEventIfNotExists`, `getEventsByStatus`, and
`batchUpdateEventStatus` optimizations. Connector 2 implements them through a
unique index, ordered queries, and MongoDB `bulkWrite`.

These operations reduce database round trips but remain an unfenced state
model. They must not be described as equivalent to the atomic core 3 contract.

## Core 3 and connector 3

Core 3 requires atomic consumer claims and fenced transitions. Deferred outbox
processing additionally requires exclusive batch claims, individual claims,
confirmed completion, and delayed release.

Connector 3 stores stable service identity, ephemeral instance identity,
fencing tokens, and lease expiration. Claims and transitions use conditional
MongoDB updates so a stale process cannot overwrite the replacement owner.

## Upgrade policy

Upgrade one connector major at a time and deploy schema/index changes before
enabling the matching core runtime. Do not widen peer dependency ranges across
core majors: compiling against the common CRUD surface can conceal missing
resilience guarantees.

The application owns message-handler idempotency in every version. RabbitMQ and
MongoDB do not share a distributed transaction, so a confirmed publication or
domain side effect may still be observed again after a later failure.
