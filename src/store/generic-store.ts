import type {Model} from "mongoose";
import {EventSerializer} from "../types";
import {EventConsumeStatus, EventMessage, EventPublishStatus, EventStore} from "@resilientmq/core/types";

/**
 * Generic MongoDB-backed EventStore implementation.
 * Model name and serializer are injected in the constructor.
 */
export class GenericMongooseStore implements EventStore {
    private readonly model: Model<any>;
    private readonly serializer?: EventSerializer;

    constructor(model: Model<any>, serializer?: EventSerializer) {
        this.model = model;
        this.serializer = serializer;
    }

    async saveEvent(event: EventMessage): Promise<void> {
        const doc = this.serializer ? this.serializer.toStorageFormat(event) : {...event};
        await this.model.create(doc);
    }

    async updateEventStatus(
        event: EventMessage,
        status: EventConsumeStatus | EventPublishStatus
    ): Promise<void> {
        const update = this.serializer ? {$set: {status}} : {status};
        await this.model.updateOne({messageId: event.messageId}, update).exec();
    }

    async getEvent(event: EventMessage): Promise<EventMessage | null> {
        const found = await this.model.findOne({messageId: event.messageId}).exec();
        if (!found) return null;

        return this.serializer ? this.serializer.fromStorageFormat(found) : (found.toObject() as EventMessage);
    }

    async deleteEvent(event: EventMessage): Promise<void> {
        await this.model.deleteOne({messageId: event.messageId}).exec();
    }
}
