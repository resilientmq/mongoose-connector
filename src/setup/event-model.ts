import mongoose, {Schema, type Model} from 'mongoose';
import type {EventMessage} from '@resilientmq/core';

/** Stored event fields used by the default model. */
export interface MongooseEventDocument extends Omit<EventMessage, 'properties'> {
    /** AMQP properties persisted without schema coercion. */
    properties?: Record<string, unknown>;

    /** Stable service identity used by fenced claims. */
    serviceId?: string;

    /** Ephemeral process identity owning the current lease. */
    instanceId?: string;

    /** Token that rejects transitions from an expired owner. */
    fencingToken?: string;

    /** Time after which another process may recover the claim. */
    leaseExpiresAt?: Date;

    /** Number of outbox claims or current RabbitMQ delivery attempt. */
    attempt?: number;

    /** Time of the most recent claim. */
    lastAttemptAt?: Date;

    /** Time of a terminal inbox transition. */
    completedAt?: Date;

    /** Earliest time at which an outbox row may be claimed again. */
    nextAttemptAt?: Date;

    /** Time when RabbitMQ confirmed publication. */
    publishedAt?: Date;

    /** Persisted error class name. */
    errorName?: string;

    /** Persisted error message. */
    errorMessage?: string;

    /** Persisted error stack. */
    errorStack?: string;

    /** Document creation time managed by Mongoose. */
    createdAt?: Date;

    /** Document update time managed by Mongoose. */
    updatedAt?: Date;
}

/** Determines the unique identity and operational indexes of a default model. */
export type MongooseStoreRole = 'consumer' | 'publisher';

/** Returns an existing model or registers the connector's default event schema. */
export function getEventModel(
    name: string,
    customModel?: Model<any>,
    client: typeof mongoose = mongoose,
    role: MongooseStoreRole = 'publisher'
): Model<any> {
    if (customModel) return customModel;
    const existing = client.models[name];
    if (existing) return existing;

    const schema = new Schema<MongooseEventDocument>({
        messageId: {type: String, required: true},
        type: {type: String},
        payload: {type: Schema.Types.Mixed, required: true},
        status: {type: String, index: true},
        routingKey: {type: String},
        properties: {type: Schema.Types.Mixed},
        serviceId: {type: String},
        instanceId: {type: String},
        fencingToken: {type: String},
        leaseExpiresAt: {type: Date},
        attempt: {type: Number, default: 0},
        lastAttemptAt: {type: Date},
        completedAt: {type: Date},
        nextAttemptAt: {type: Date},
        publishedAt: {type: Date},
        errorName: {type: String},
        errorMessage: {type: String},
        errorStack: {type: String}
    }, {
        timestamps: true,
        versionKey: false,
        minimize: false
    });
    if (role === 'consumer') schema.index({serviceId: 1, messageId: 1}, {unique: true});
    else schema.index({messageId: 1}, {unique: true});
    schema.index({status: 1, nextAttemptAt: 1, leaseExpiresAt: 1, createdAt: 1});
    schema.index({serviceId: 1, status: 1, leaseExpiresAt: 1});
    return client.model<MongooseEventDocument>(name, schema);
}
