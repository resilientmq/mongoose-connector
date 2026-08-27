import {randomUUID} from 'node:crypto';
import {
    EventConsumeStatus,
    EventPublishStatus,
    type ClaimedPublishEvent,
    type ConsumeClaimRequest,
    type ConsumeClaimResult,
    type ConsumeTransitionRequest,
    type ConsumerEventStore,
    type DistributedPublisherEventStore,
    type EventMessage,
    type PublishClaimRequest,
    type PublishEventClaimRequest,
    type PublishTransitionRequest
} from '@resilientmq/core';
import type {Model} from 'mongoose';
import {DefaultEventSerializer} from '../default/default-event.serializer.js';
import type {EventSerializer, StoredEventDocument} from '../types/index.js';

const OUTBOX_CLAIMED_STATUS = 'PUBLISHING';
const INBOX_RETRYABLE_STATUSES = [EventConsumeStatus.RECEIVED, EventConsumeStatus.RETRY] as const;
const OUTBOX_READY_STATUSES = [EventPublishStatus.PENDING, EventPublishStatus.ERROR] as const;

/** MongoDB-backed core 3.x event store with atomic leases and fenced transitions. */
export class GenericMongooseStore implements ConsumerEventStore, DistributedPublisherEventStore {
    /** Creates a store over one Mongoose model. */
    constructor(
        private readonly model: Model<any>,
        private readonly serializer: EventSerializer = DefaultEventSerializer
    ) {}

    /** Persists one event. */
    async saveEvent(event: EventMessage): Promise<void> {
        await this.model.create(this.serializer.toStorageFormat(event));
    }

    /** Inserts an event unless its unique identity already exists. */
    async saveEventIfNotExists(event: EventMessage): Promise<boolean> {
        try {
            await this.saveEvent(event);
            return true;
        } catch (error) {
            if (isDuplicateKeyError(error)) return false;
            throw error;
        }
    }

    /** Updates the serializer-defined status field. */
    async updateEventStatus(
        event: EventMessage,
        status: EventConsumeStatus | EventPublishStatus
    ): Promise<void> {
        await this.model.updateOne(
            this.identity(event),
            {$set: {[this.serializer.getStatusField()]: status}}
        ).exec();
    }

    /** Retrieves one event by serializer-defined identity. */
    async getEvent(event: EventMessage): Promise<EventMessage | null> {
        const found = await this.model.findOne(this.identity(event)).exec();
        return found ? this.deserialize(found) : null;
    }

    /** Deletes one event by serializer-defined identity. */
    async deleteEvent(event: EventMessage): Promise<void> {
        await this.model.deleteOne(this.identity(event)).exec();
    }

    /** Retrieves a bounded oldest-first publisher batch. */
    async getPendingEvents(status: EventPublishStatus, limit = 100): Promise<EventMessage[]> {
        const rows = await this.model.find({[this.serializer.getStatusField()]: status})
            .sort({createdAt: 1})
            .limit(Math.max(0, Math.floor(limit)))
            .exec();
        return rows.map(row => this.deserialize(row));
    }

    /** Retrieves every event with an exact consumer or publisher status. */
    async getEventsByStatus(status: EventConsumeStatus | EventPublishStatus): Promise<EventMessage[]> {
        const rows = await this.model.find({[this.serializer.getStatusField()]: status})
            .sort({createdAt: 1})
            .exec();
        return rows.map(row => this.deserialize(row));
    }

    /** Applies status changes through one MongoDB bulk operation. */
    async batchUpdateEventStatus(updates: Array<{
        event: EventMessage;
        status: EventConsumeStatus | EventPublishStatus;
    }>): Promise<void> {
        if (updates.length === 0) return;
        await this.model.bulkWrite(updates.map(({event, status}) => ({
            updateOne: {
                filter: this.identity(event),
                update: {$set: {[this.serializer.getStatusField()]: status}}
            }
        })));
    }

    /** Atomically inserts, acquires, or recovers an inbox processing lease. */
    async claimConsumeEvent(request: ConsumeClaimRequest, contentionRetry = 0): Promise<ConsumeClaimResult> {
        const fencingToken = randomUUID();
        const leaseExpiresAt = request.now + request.leaseDurationMs;
        const statusField = this.serializer.getStatusField();
        const identity = this.consumerIdentity(request.serviceId, request.event);
        let claimed: unknown;
        try {
            claimed = await this.model.findOneAndUpdate(
                {
                    ...identity,
                    $or: [
                        {[statusField]: {$in: [...INBOX_RETRYABLE_STATUSES]}},
                        {
                            [statusField]: EventConsumeStatus.PROCESSING,
                            $or: [
                                {leaseExpiresAt: null},
                                {leaseExpiresAt: {$lte: new Date(request.now)}}
                            ]
                        }
                    ]
                },
                {
                    $set: {
                        ...this.serializer.toStorageFormat(request.event),
                        [statusField]: EventConsumeStatus.PROCESSING,
                        serviceId: request.serviceId,
                        instanceId: request.instanceId,
                        fencingToken,
                        leaseExpiresAt: new Date(leaseExpiresAt),
                        attempt: request.attempt,
                        lastAttemptAt: new Date(request.now),
                        completedAt: null,
                        ...serializeError()
                    }
                },
                {returnDocument: 'after', upsert: true, setDefaultsOnInsert: true}
            ).exec();
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;
        }
        if (claimed) return {outcome: 'acquired', fencingToken, leaseExpiresAt};

        const current = await this.model.findOne(identity).exec();
        if (!current) {
            if (contentionRetry >= 3) throw new Error('Inbox claim could not stabilize after concurrent deletion');
            return this.claimConsumeEvent(request, contentionRetry + 1);
        }
        const row = asRecord(current);
        if (row[statusField] === EventConsumeStatus.DONE || row[statusField] === EventConsumeStatus.ERROR) {
            return {outcome: 'completed'};
        }
        return {
            outcome: 'busy',
            leaseExpiresAt: toMilliseconds(row.leaseExpiresAt, leaseExpiresAt)
        };
    }

    /** Applies an inbox transition only while its process and fencing token own the lease. */
    async transitionConsumeEvent(request: ConsumeTransitionRequest): Promise<boolean> {
        const statusField = this.serializer.getStatusField();
        const terminal = request.status === EventConsumeStatus.DONE || request.status === EventConsumeStatus.ERROR;
        const result = await this.model.updateOne(
            {
                ...this.consumerIdentity(request.serviceId, request.event),
                [statusField]: EventConsumeStatus.PROCESSING,
                instanceId: request.instanceId,
                fencingToken: String(request.fencingToken)
            },
            {
                $set: {
                    [statusField]: request.status,
                    instanceId: null,
                    fencingToken: null,
                    leaseExpiresAt: null,
                    completedAt: terminal ? new Date(request.now) : null,
                    ...serializeError(request.error)
                }
            }
        ).exec();
        return result.matchedCount === 1;
    }

    /** Atomically claims one known pending or expired outbox event. */
    async claimPublishEvent(request: PublishEventClaimRequest): Promise<ClaimedPublishEvent | null> {
        const fencingToken = randomUUID();
        const leaseExpiresAt = request.now + request.leaseDurationMs;
        const claimed = await this.model.findOneAndUpdate(
            {
                ...this.identity(request.event),
                $or: this.outboxClaimableConditions(request.now)
            },
            this.outboxClaimUpdate(request, fencingToken, leaseExpiresAt),
            {returnDocument: 'after'}
        ).exec();
        return claimed ? {event: request.event, fencingToken, leaseExpiresAt} : null;
    }

    /** Claims a bounded outbox batch without sharing documents across replicas. */
    async claimPendingEvents(request: PublishClaimRequest): Promise<ClaimedPublishEvent[]> {
        const limit = Math.max(0, Math.floor(request.limit));
        const claims: ClaimedPublishEvent[] = [];
        for (let index = 0; index < limit; index += 1) {
            const fencingToken = randomUUID();
            const leaseExpiresAt = request.now + request.leaseDurationMs;
            const claimed = await this.model.findOneAndUpdate(
                {$or: this.outboxClaimableConditions(request.now)},
                this.outboxClaimUpdate(request, fencingToken, leaseExpiresAt),
                {returnDocument: 'after', sort: {nextAttemptAt: 1, createdAt: 1}}
            ).exec();
            if (!claimed) break;
            claims.push({
                event: this.deserialize(claimed),
                fencingToken,
                leaseExpiresAt
            });
        }
        return claims;
    }

    /** Marks an outbox event published only for the active fencing owner. */
    async completePublishedEvent(request: PublishTransitionRequest): Promise<boolean> {
        const result = await this.model.updateOne(
            this.outboxOwnerIdentity(request),
            {
                $set: {
                    [this.serializer.getStatusField()]: EventPublishStatus.PUBLISHED,
                    serviceId: null,
                    instanceId: null,
                    fencingToken: null,
                    leaseExpiresAt: null,
                    nextAttemptAt: null,
                    publishedAt: new Date(request.now),
                    ...serializeError()
                }
            }
        ).exec();
        return result.matchedCount === 1;
    }

    /** Releases an outbox event for a delayed retry only for the active fencing owner. */
    async releasePublishEvent(request: PublishTransitionRequest): Promise<boolean> {
        const result = await this.model.updateOne(
            this.outboxOwnerIdentity(request),
            {
                $set: {
                    [this.serializer.getStatusField()]: EventPublishStatus.ERROR,
                    serviceId: null,
                    instanceId: null,
                    fencingToken: null,
                    leaseExpiresAt: null,
                    nextAttemptAt: new Date(request.nextAttemptAt ?? request.now),
                    ...serializeError(request.error)
                }
            }
        ).exec();
        return result.matchedCount === 1;
    }

    private identity(event: EventMessage): Record<string, unknown> {
        return this.serializer.getIdentityFilter?.(event) ?? {messageId: event.messageId};
    }

    private consumerIdentity(serviceId: string, event: EventMessage): Record<string, unknown> {
        return {...this.identity(event), serviceId};
    }

    private outboxClaimableConditions(now: number): Record<string, unknown>[] {
        const statusField = this.serializer.getStatusField();
        return [
            {
                [statusField]: {$in: [...OUTBOX_READY_STATUSES]},
                $or: [{nextAttemptAt: null}, {nextAttemptAt: {$lte: new Date(now)}}]
            },
            {
                [statusField]: OUTBOX_CLAIMED_STATUS,
                $or: [{leaseExpiresAt: null}, {leaseExpiresAt: {$lte: new Date(now)}}]
            }
        ];
    }

    private outboxClaimUpdate(
        request: PublishClaimRequest | PublishEventClaimRequest,
        fencingToken: string,
        leaseExpiresAt: number
    ): Record<string, unknown> {
        return {
            $set: {
                [this.serializer.getStatusField()]: OUTBOX_CLAIMED_STATUS,
                serviceId: request.serviceId,
                instanceId: request.instanceId,
                fencingToken,
                leaseExpiresAt: new Date(leaseExpiresAt),
                lastAttemptAt: new Date(request.now),
                ...serializeError()
            },
            $inc: {attempt: 1}
        };
    }

    private outboxOwnerIdentity(request: PublishTransitionRequest): Record<string, unknown> {
        return {
            ...this.identity(request.event),
            [this.serializer.getStatusField()]: OUTBOX_CLAIMED_STATUS,
            serviceId: request.serviceId,
            instanceId: request.instanceId,
            fencingToken: String(request.fencingToken)
        };
    }

    private deserialize(document: unknown): EventMessage {
        return this.serializer.fromStorageFormat(document as StoredEventDocument);
    }
}

function asRecord(document: unknown): Record<string, unknown> {
    if (!document || typeof document !== 'object') return {};
    const candidate = document as Record<string, unknown> & {toObject?: () => Record<string, unknown>};
    return typeof candidate.toObject === 'function' ? candidate.toObject() : candidate;
}

function toMilliseconds(value: unknown, fallback: number): number {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
}

function serializeError(error?: Error): Record<string, string | null> {
    return {
        errorName: bounded(error?.name, 256),
        errorMessage: bounded(error?.message, 8_192),
        errorStack: bounded(error?.stack, 32_768)
    };
}

function bounded(value: string | undefined, maximumLength: number): string | null {
    return value === undefined ? null : value.slice(0, maximumLength);
}

function isDuplicateKeyError(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && (error as {code?: unknown}).code === 11_000);
}
