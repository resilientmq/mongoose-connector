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
 * MongoDB-based implementation of the EventStore interface for consumers.
 * Retrieves model and serializer from the globally set environment.
 */
export class MongooseConsumerStore implements EventStore {
    private model: Model<any>;
    private serializer?: EventSerializer;

    constructor() {
        const config = Environment.get();
        const consumerConfig = config.rabbit.consumer;

        if (consumerConfig?.serializer && !consumerConfig.model) {
            throw new Error(
                '[ResilientMQ:Mongoose] A model must be provided when using a custom serializer for the consumer.'
            );
        }

        this.model = getEventModel('consumer_event_log', consumerConfig?.model);
        this.serializer = consumerConfig?.serializer ?? DefaultEventSerializer;
    }

    /**
     * Persists an event into MongoDB.
     *
     * @param event - The event to save.
     */
    async saveEvent(event: EventMessage): Promise<void> {
        const doc = this.serializer
            ? this.serializer.toStorageFormat(event)
            : {...event};

        await this.model.create(doc);
    }

    /**
     * Updates the status of an event by messageId.
     *
     * @param messageId - The message identifier to locate the document.
     * @param status - New status to assign.
     */
    async updateEventStatus(
        messageId: string,
        status: EventConsumeStatus | EventPublishStatus
    ): Promise<void> {
        const update = this.serializer
            ? {$set: {status}} // Update only status when using serializer
            : {status};

        await this.model.updateOne({messageId}, update).exec();
    }

    /**
     * Finds a stored event by its message ID.
     *
     * @param messageId - Identifier used to find the event.
     * @returns The hydrated event or null.
     */
    async getEvent(messageId: string): Promise<EventMessage | null> {
        const found = await this.model.findOne({messageId}).exec();

        if (!found) return null;

        return this.serializer
            ? this.serializer.fromStorageFormat(found)
            : (found.toObject() as EventMessage);
    }

    /**
     * Deletes an event by messageId from MongoDB.
     *
     * @param messageId - The ID of the event to delete.
     */
    async deleteEvent(messageId: string): Promise<void> {
        await this.model.deleteOne({messageId}).exec();
    }
}
