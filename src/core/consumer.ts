import { ResilientConsumer } from '@resilientmq/core';
import { Environment } from '../setup/environment';
import { MongooseConsumerStore } from '../store/consumer-store';

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
        store: new MongooseConsumerStore()
    });

    await consumer.start();
}
