import mongoose, {ConnectOptions} from "mongoose";

/**
 * Singleton class for managing a single shared MongoDB connection.
 */
export class MongoConnection {
    private static instance: MongoConnection;
    private isConnected = false;

    private constructor() {
    }

    /**
     * Get the singleton instance.
     */
    public static getInstance(): MongoConnection {
        if (!MongoConnection.instance) {
            MongoConnection.instance = new MongoConnection();
        }
        return MongoConnection.instance;
    }

    /**
     * Connect to MongoDB if not already connected.
     *
     * @param uri - MongoDB connection URI.
     * @param options - Optional connection options.
     */
    public async connect(uri: string, options?: ConnectOptions): Promise<void> {
        if (this.isConnected) return;

        await mongoose.connect(uri, options);
        this.isConnected = true;
    }

    /**
     * Disconnect from MongoDB.
     */
    public async disconnect(): Promise<void> {
        if (!this.isConnected) return;

        await mongoose.disconnect();
        this.isConnected = false;
    }

    /**
     * Returns whether a connection is active.
     */
    public get status(): boolean {
        return this.isConnected;
    }

    /**
     * Access to raw mongoose instance.
     */
    public get client(): typeof mongoose {
        return mongoose;
    }
}
