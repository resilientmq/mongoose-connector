import {MongooseConnectorConfig} from "@resilientmq/types__mongoose-connector/src/mongo-connector-config";
import {MongoConnection} from "../state/mongo-connection";
import {setLogLevel} from "@resilientmq/core";

export class Environment {
    private static config: MongooseConnectorConfig;
    private static callCount = 0;

    /**
     * Initializes the environment config.
     * Throws an error if called more than twice.
     */
    public static async setConfig(config: MongooseConnectorConfig): Promise<void> {
        if (this.callCount >= 2) {
            throw new Error('[ResilientMQ:Mongoose] setConfig cannot be called more than twice.');
        }

        this.callCount++;
        this.config = config;

        if (config.logLevel) {
            setLogLevel(config.logLevel);
        }

        await MongoConnection.getInstance().connect(config.mongo.uri, config.mongo.options ?? {});
    }

    /**
     * Returns the current environment configuration.
     */
    public static get(): MongooseConnectorConfig {
        if (!this.config) {
            throw new Error('[ResilientMQ:Mongoose] Environment not initialized. Call setConfig() first.');
        }
        return this.config;
    }
}