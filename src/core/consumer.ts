import type {ResilientConsumer} from '@resilientmq/core';
import {Environment} from '../setup/environment.js';

/** Starts and returns the consumer configured through `setEnvironment`. */
export async function consume(): Promise<ResilientConsumer> {
    return Environment.getConnector().startConsumer();
}
