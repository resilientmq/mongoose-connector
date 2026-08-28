import {
    ResilientConsumer,
    ResilientEventPublisher,
    setLogLevel
} from '@resilientmq/core';
import type {EventMessage} from '@resilientmq/core';
import {getEventModel} from './setup/event-model.js';
import {MongoConnection} from './state/mongo-connection.js';
import {GenericMongooseStore} from './store/generic-store.js';
import type {
    MongooseConnectorConfig,
    MongooseConsumerConfig,
    MongoosePublisherConfig,
    MongooseStoreOptions
} from './types/index.js';

/** Owns configured consumer and publisher runtimes while sharing one MongoDB connection. */
export class MongooseConnector {
    private consumer: ResilientConsumer | undefined;
    private publisher: ResilientEventPublisher | undefined;

    /** Creates a connector without opening MongoDB or RabbitMQ connections. */
    constructor(
        private readonly config: MongooseConnectorConfig,
        private readonly mongoConnection = MongoConnection.getInstance()
    ) {
        if (config.logLevel) setLogLevel(config.logLevel);
    }

    /** Opens the configured MongoDB connection. */
    async connect(): Promise<void> {
        await this.mongoConnection.connect(this.config.mongo.uri, this.config.mongo.options);
    }

    /** Creates or returns the configured consumer runtime. */
    createConsumer(): ResilientConsumer {
        if (this.consumer) return this.consumer;
        const configured = this.requireConsumerConfig();
        const {coreConfig, storeOptions} = splitConsumerConfig(configured);
        this.consumer = new ResilientConsumer({
            ...coreConfig,
            store: this.createStore('consumer_event_log', storeOptions, 'consumer')
        });
        return this.consumer;
    }

    /** Starts the configured consumer after MongoDB is ready. */
    async startConsumer(): Promise<ResilientConsumer> {
        await this.connect();
        const consumer = this.createConsumer();
        await consumer.start();
        return consumer;
    }

    /** Creates or returns the configured long-lived publisher runtime. */
    createPublisher(): ResilientEventPublisher {
        if (this.publisher) return this.publisher;
        const configured = this.requirePublisherConfig();
        const {coreConfig, storeOptions} = splitPublisherConfig(configured);
        this.publisher = new ResilientEventPublisher({
            ...coreConfig,
            store: this.createStore('publisher_event_log', storeOptions, 'publisher')
        });
        return this.publisher;
    }

    /** Publishes through one reusable publisher instead of reconnecting per event. */
    async publish(event: EventMessage, options?: {storeOnly?: boolean}): Promise<void> {
        await this.connect();
        await this.createPublisher().publish(event, options);
    }

    /** Stops RabbitMQ runtimes before closing the shared MongoDB connection. */
    async disconnect(): Promise<void> {
        if (this.consumer) {
            await this.consumer.stop();
            this.consumer = undefined;
        }
        if (this.publisher) {
            await this.publisher.disconnect();
            this.publisher = undefined;
        }
        await this.mongoConnection.disconnect();
    }

    private createStore(
        defaultName: string,
        options: MongooseStoreOptions,
        role: 'consumer' | 'publisher'
    ): GenericMongooseStore {
        const model = getEventModel(
            options.modelName ?? defaultName,
            options.model,
            this.mongoConnection.client,
            role
        );
        return new GenericMongooseStore(model, options.serializer);
    }

    private requireConsumerConfig(): MongooseConsumerConfig {
        const configured = this.config.rabbit.consumer;
        if (!configured) throw new Error('[ResilientMQ:Mongoose] Consumer configuration is not available');
        return configured;
    }

    private requirePublisherConfig(): MongoosePublisherConfig {
        const configured = this.config.rabbit.publisher;
        if (!configured) throw new Error('[ResilientMQ:Mongoose] Publisher configuration is not available');
        return configured;
    }
}

function splitConsumerConfig(config: MongooseConsumerConfig): {
    coreConfig: Omit<MongooseConsumerConfig, keyof MongooseStoreOptions>;
    storeOptions: MongooseStoreOptions;
} {
    const {model, serializer, modelName, ...coreConfig} = config;
    return {
        coreConfig,
        storeOptions: definedStoreOptions({model, serializer, modelName})
    };
}

function splitPublisherConfig(config: MongoosePublisherConfig): {
    coreConfig: Omit<MongoosePublisherConfig, keyof MongooseStoreOptions>;
    storeOptions: MongooseStoreOptions;
} {
    const {model, serializer, modelName, ...coreConfig} = config;
    return {
        coreConfig,
        storeOptions: definedStoreOptions({model, serializer, modelName})
    };
}

function definedStoreOptions(options: {
    model: MongooseStoreOptions['model'] | undefined;
    serializer: MongooseStoreOptions['serializer'] | undefined;
    modelName: MongooseStoreOptions['modelName'] | undefined;
}): MongooseStoreOptions {
    return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) as MongooseStoreOptions;
}
