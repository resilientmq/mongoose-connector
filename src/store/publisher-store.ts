import type {EventMessage, EventStore} from '@resilientmq/types__core';
import {
    EventConsumeStatus,
    EventPublishStatus
} from '@resilientmq/types__core';
import type {Document, Model} from 'mongoose';
import {Environment} from '../setup/environment';
import {EventSerializer} from "@resilientmq/types__mongoose-connector/src/event-serializer";
import {getEventModel} from "../setup/event-model";
import {DefaultEventSerializer} from "../default/default-event.serializer";

/**
 * MongoDB-based implementation of the EventStore interface for publishers.
 * Retrieves model and serializer from the global environment config.
 */
export class MongoosePublisherStore implements EventStore {
    private model: Model<any>;
    private serializer?: EventSerializer;

    constructor() {
        const config = Environment.get();
        const publisherConfig = config.rabbit.publisher;

        if (publisherConfig?.serializer && !publisherConfig.model) {
            throw new Error(
                '[ResilientMQ:Mongoose] A model must be provided when using a custom serializer for the publisher.'
            );
        }

        this.model = getEventModel('publisher_event_log', publisherConfig?.model);
        this.serializer = publisherConfig?.serializer ?? DefaultEventSerializer;
    }

    /**
     * Stores the event in MongoDB before publishing.
     *
     * @param event - The event to persist.
     */
    async saveEvent(event: EventMessage): Promise<void> {
        const doc = this.serializer
            ? this.serializer.toStorageFormat(event)
            : {...event};

        await this.model.create(doc);
    }

    /**
     * Updates the publishing or consuming status of an event.
     *
     * @param messageId - The identifier of the message.
     * @param status - New status (e.g. PUBLISHED, ERROR).
     */
    async updateEventStatus(
        messageId: string,
        status: EventPublishStatus | EventConsumeStatus
    ): Promise<void> {
        const update = this.serializer
            ? {$set: {status}}
            : {status};

        await this.model.updateOne({messageId}, update).exec();
    }

    /**
     * Retrieves an event by its messageId.
     *
     * @param messageId - The message ID to search for.
     * @returns The reconstructed event or null.
     */
    async getEvent(messageId: string): Promise<EventMessage | null> {
        const found = await this.model.findOne({messageId}).exec();

        if (!found) return null;

        return this.serializer
            ? this.serializer.fromStorageFormat(found)
            : (found.toObject() as EventMessage);
    }

    /**
     * Removes an event by messageId.
     *
     * @param messageId - The event ID to delete.
     */
    async deleteEvent(messageId: string): Promise<void> {
        await this.model.deleteOne({messageId}).exec();
    }
}
