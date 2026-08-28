import mongoose, {type Model} from 'mongoose';

const runtime = vi.hoisted(() => ({
    consumers: [] as Array<{start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; config: unknown}>,
    publishers: [] as Array<{publish: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; config: unknown}>,
    setLogLevel: vi.fn()
}));

vi.mock('@resilientmq/core', () => ({
    ResilientConsumer: class {
        readonly start = vi.fn().mockResolvedValue(undefined);
        readonly stop = vi.fn().mockResolvedValue(undefined);

        constructor(readonly config: unknown) {
            runtime.consumers.push(this);
        }
    },
    ResilientEventPublisher: class {
        readonly publish = vi.fn().mockResolvedValue(undefined);
        readonly disconnect = vi.fn().mockResolvedValue(undefined);

        constructor(readonly config: unknown) {
            runtime.publishers.push(this);
        }
    },
    setLogLevel: runtime.setLogLevel
}));

import {
    Environment,
    MongooseConnector,
    MongoConnection,
    consume,
    disconnect,
    publish,
    setEnvironment,
    type MongooseConnectorConfig
} from '../src/index.js';

describe('MongooseConnector', () => {
    beforeEach(async () => {
        runtime.consumers.length = 0;
        runtime.publishers.length = 0;
        runtime.setLogLevel.mockClear();
        await Environment.reset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('reuses object-oriented consumer and publisher runtimes', async () => {
        const mongo = fakeConnection();
        const connector = new MongooseConnector(configuration(), mongo.connection);
        expect(runtime.setLogLevel).toHaveBeenCalledWith('warn');

        const consumer = connector.createConsumer();
        expect(connector.createConsumer()).toBe(consumer);
        await expect(connector.startConsumer()).resolves.toBe(consumer);
        expect(runtime.consumers[0]?.start).toHaveBeenCalledTimes(1);

        const publisher = connector.createPublisher();
        expect(connector.createPublisher()).toBe(publisher);
        await connector.publish({messageId: 'event-1', payload: {}}, {storeOnly: true});
        expect(runtime.publishers[0]?.publish).toHaveBeenCalledWith(
            {messageId: 'event-1', payload: {}},
            {storeOnly: true}
        );
        expect(mongo.connect).toHaveBeenCalledTimes(2);

        await connector.disconnect();
        expect(runtime.consumers[0]?.stop).toHaveBeenCalledTimes(1);
        expect(runtime.publishers[0]?.disconnect).toHaveBeenCalledTimes(1);
        expect(mongo.disconnect).toHaveBeenCalledTimes(1);
    });

    it('fails fast when a requested runtime is not configured', () => {
        const mongo = fakeConnection();
        const connector = new MongooseConnector({mongo: {uri: 'mongodb://localhost'}, rabbit: {}}, mongo.connection);
        expect(() => connector.createConsumer()).toThrow(/Consumer configuration/);
        expect(() => connector.createPublisher()).toThrow(/Publisher configuration/);
    });

    it('supports the functional compatibility facade', async () => {
        const mongo = fakeConnection();
        vi.spyOn(MongoConnection, 'getInstance').mockReturnValue(mongo.connection);
        const config = configuration();

        await setEnvironment(config);
        expect(Environment.get()).toBe(config);
        await consume();
        await publish({messageId: 'functional', payload: {}});
        await disconnect();

        expect(runtime.consumers).toHaveLength(1);
        expect(runtime.publishers).toHaveLength(1);
        expect(() => Environment.get()).toThrow(/not initialized/);
        expect(() => Environment.getConnector()).toThrow(/not initialized/);
    });

    it('replaces an existing functional environment safely', async () => {
        const mongo = fakeConnection();
        vi.spyOn(MongoConnection, 'getInstance').mockReturnValue(mongo.connection);
        await setEnvironment(configuration());
        await setEnvironment(configuration());
        expect(mongo.disconnect).toHaveBeenCalledTimes(1);
        await Environment.reset();
    });
});

function configuration(): MongooseConnectorConfig {
    const model = {} as Model<any>;
    return {
        mongo: {uri: 'mongodb://localhost/resilientmq'},
        rabbit: {
            consumer: {
                connection: 'amqp://localhost',
                consumeQueue: {queue: 'events'},
                eventsToProcess: [{type: 'event', handler: async () => undefined}],
                model
            },
            publisher: {
                connection: 'amqp://localhost',
                queue: 'events',
                model
            }
        },
        logLevel: 'warn'
    };
}

function fakeConnection() {
    const connect = vi.fn().mockResolvedValue(undefined);
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const connection = {
        connect,
        disconnect,
        client: mongoose
    } as unknown as MongoConnection;
    return {connection, connect, disconnect};
}
