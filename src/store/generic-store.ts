import type {
    EventConsumeStatus,
    EventMessage,
    EventPublishStatus,
    EventStore
} from '@resilientmq/core/dist/types/index.js';
import type {Model} from 'mongoose';
import {DefaultEventSerializer} from '../default/default-event.serializer.js';
import type {EventSerializer, StoredEventDocument} from '../types/index.js';

/** MongoDB-backed core 1.x event store with serializer-defined identity. */
export class GenericMongooseStore implements EventStore {
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

    private identity(event: EventMessage): Record<string, unknown> {
        return this.serializer.getIdentityFilter?.(event) ?? {messageId: event.messageId};
    }

    private deserialize(document: unknown): EventMessage {
        return this.serializer.fromStorageFormat(document as StoredEventDocument);
    }
}

function isDuplicateKeyError(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && (error as {code?: unknown}).code === 11_000);
}
