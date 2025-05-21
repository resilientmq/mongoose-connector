import {ConnectOptions, Model} from "mongoose";
import {EventSerializer} from "./event-serializer";
import {ResilientConsumerConfig, ResilientPublisherConfig} from "@resilientmq/core/types";

/**
 * Configuration structure for initializing the environment in the Mongoose connector.
 */
export type MongooseConnectorConfig = {
    /**
     * MongoDB connection settings.
     */
    mongo: {
        /**
         * MongoDB URI (e.g. mongodb://localhost:27017).
         */
        uri: string;

        /**
         * Optional connection options for Mongoose.
         */
        options?: ConnectOptions;
    };

    /**
     * RabbitMQ configuration including consumer and publisher settings.
     */
    rabbit: {
        /**
         * Consumer configuration (from core ResilientMQ).
         * You do **not** need to include the `store`, it is injected by this connector.
         */
        consumer: Omit<ResilientConsumerConfig, 'store'> & {
            /**
             * Optional custom Mongoose model to use for storing consumed events.
             */
            model?: Model<any>;

            /**
             * Optional serializer to convert between event format and DB format.
             */
            serializer?: EventSerializer;
        };

        /**
         * Publisher configuration (from core ResilientMQ).
         * You do **not** need to include the `store`, it is injected by this connector.
         */
        publisher: Omit<ResilientPublisherConfig, 'store'> & {
            /**
             * Optional custom Mongoose model to use for storing published events.
             */
            model?: Model<any>;

            /**
             * Optional serializer to convert between the event format and DB format.
             */
            serializer?: EventSerializer;
        };
    };

    /**
     * Global log level (overrides default).
     */
    logLevel?: 'none' | 'warn' | 'info' | 'error';
};