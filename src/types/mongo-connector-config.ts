import type {ResilientConsumerConfig, ResilientPublisherConfig} from '@resilientmq/core';
import type {ConnectOptions, Model} from 'mongoose';
import type {EventSerializer} from './event-serializer.js';

/** Persistence customization shared by consumer and publisher stores. */
export interface MongooseStoreOptions {
    /** Existing application-owned model. */
    model?: Model<any>;

    /** Serializer matching the custom model. */
    serializer?: EventSerializer;

    /** Model name used when the connector creates its default model. */
    modelName?: string;
}

/** Consumer configuration without the connector-owned store. */
export type MongooseConsumerConfig = Omit<ResilientConsumerConfig, 'store'> & MongooseStoreOptions;

/** Publisher configuration without the connector-owned store. */
export type MongoosePublisherConfig = Omit<ResilientPublisherConfig, 'store'> & MongooseStoreOptions;

/** Configuration for one object-oriented Mongoose connector runtime. */
export interface MongooseConnectorConfig {
    /** MongoDB connection settings. */
    mongo: {
        /** MongoDB connection URI. */
        uri: string;

        /** Optional Mongoose connection options. */
        options?: ConnectOptions;
    };

    /** Optional RabbitMQ runtimes created by this connector. */
    rabbit: {
        /** Consumer runtime configuration. */
        consumer?: MongooseConsumerConfig;

        /** Publisher runtime configuration. */
        publisher?: MongoosePublisherConfig;
    };

    /** ResilientMQ logger verbosity. */
    logLevel?: 'none' | 'warn' | 'info' | 'error';
}
