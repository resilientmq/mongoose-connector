import {MongooseConnector} from '../mongoose-connector.js';
import type {MongooseConnectorConfig} from '../types/index.js';

/** Compatibility registry for applications using the functional facade. */
export class Environment {
    private static config: MongooseConnectorConfig | undefined;
    private static connector: MongooseConnector | undefined;

    /** Replaces the functional facade configuration and opens MongoDB. */
    static async setConfig(config: MongooseConnectorConfig): Promise<void> {
        if (this.connector) await this.connector.disconnect();
        this.config = config;
        this.connector = new MongooseConnector(config);
        await this.connector.connect();
    }

    /** Returns the configured environment. */
    static get(): MongooseConnectorConfig {
        if (!this.config) {
            throw new Error('[ResilientMQ:Mongoose] Environment not initialized; call setEnvironment() first');
        }
        return this.config;
    }

    /** Returns the connector backing the functional facade. */
    static getConnector(): MongooseConnector {
        if (!this.connector) {
            throw new Error('[ResilientMQ:Mongoose] Environment not initialized; call setEnvironment() first');
        }
        return this.connector;
    }

    /** Stops configured runtimes and clears the functional registry. */
    static async reset(): Promise<void> {
        if (this.connector) await this.connector.disconnect();
        this.connector = undefined;
        this.config = undefined;
    }
}

/** Configures the compatibility facade and connects to MongoDB. */
export async function setEnvironment(config: MongooseConnectorConfig): Promise<void> {
    await Environment.setConfig(config);
}
