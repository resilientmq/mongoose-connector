import { ResilientConsumer } from '@resilientmq/core';
import { Environment } from '../setup/environment';
import {GenericMongooseStore} from "../store/generic-store";
import {getEventModel} from "../setup/event-model";

/**
 * Starts the resilient consumer using the configured environment.
 */
export async function consume(): Promise<void> {
    const env = Environment.get();

    if (!env.rabbit.consumer.consumeQueue) {
        throw new Error('[ResilientMQ] Consumer config not set in environment');
    }

    const consumer = new ResilientConsumer({
        ...env.rabbit.consumer,
        store: new GenericMongooseStore(getEventModel('consumer_event_log', env.rabbit.consumer?.model))
    });

    await consumer.start();
}
