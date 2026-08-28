import mongoose, {Schema, type Model} from 'mongoose';
import type {EventMessage} from '@resilientmq/core/dist/types/index.js';

/** Stored event fields used by the default model. */
export interface MongooseEventDocument extends Omit<EventMessage, 'properties'> {
    /** AMQP properties persisted without schema coercion. */
    properties?: Record<string, unknown>;

    /** Document creation time managed by Mongoose. */
    createdAt?: Date;

    /** Document update time managed by Mongoose. */
    updatedAt?: Date;
}

/** Returns an existing model or registers the connector's default event schema. */
export function getEventModel(
    name: string,
    customModel?: Model<any>,
    client: typeof mongoose = mongoose
): Model<any> {
    if (customModel) return customModel;
    const existing = client.models[name];
    if (existing) return existing;

    const schema = new Schema<MongooseEventDocument>({
        messageId: {type: String, required: true, unique: true, index: true},
        type: {type: String},
        payload: {type: Schema.Types.Mixed, required: true},
        status: {type: String, index: true},
        routingKey: {type: String},
        properties: {type: Schema.Types.Mixed}
    }, {
        timestamps: true,
        versionKey: false,
        minimize: false
    });
    schema.index({status: 1, createdAt: 1});
    return client.model<MongooseEventDocument>(name, schema);
}
