import mongoose, {type ConnectOptions} from 'mongoose';

/** Coordinates one shared Mongoose connection and concurrent startup calls. */
export class MongoConnection {
    private static instance: MongoConnection | undefined;
    private connectPromise: Promise<void> | undefined;

    /** Creates a connection manager around an injectable Mongoose client. */
    constructor(private readonly mongooseClient: typeof mongoose = mongoose) {}

    /** Returns the process-wide default connection manager. */
    static getInstance(): MongoConnection {
        MongoConnection.instance ??= new MongoConnection();
        return MongoConnection.instance;
    }

    /** Connects once and shares an in-flight connection attempt. */
    async connect(uri: string, options?: ConnectOptions): Promise<void> {
        if (this.status) return;
        if (this.connectPromise) return this.connectPromise;
        this.connectPromise = this.mongooseClient.connect(uri, options).then(() => undefined);
        try {
            await this.connectPromise;
        } finally {
            this.connectPromise = undefined;
        }
    }

    /** Waits for startup and disconnects an active client. */
    async disconnect(): Promise<void> {
        if (this.connectPromise) await this.connectPromise;
        if (this.mongooseClient.connection.readyState === 0) return;
        await this.mongooseClient.disconnect();
    }

    /** Indicates whether Mongoose reports an active connection. */
    get status(): boolean {
        return this.mongooseClient.connection.readyState === 1;
    }

    /** Exposes the managed Mongoose client for model registration. */
    get client(): typeof mongoose {
        return this.mongooseClient;
    }
}
