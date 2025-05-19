import { ResilientEventPublisher } from '@resilientmq/core';
import { EventMessage } from '@resilientmq/types__core';
import { Environment } from '../setup/environment';
import { MongoosePublisherStore } from '../store/publisher-store'

/**
 * Publishes an event using the resilient publisher with the shared environment config.
 *
 * @param event - The event to publish.
 */
export async function publish(event: EventMessage): Promise<void> {
    const env = Environment.get();

    if (!env.rabbit.publisher.connection) {
        throw new Error('[ResilientMQ] Consumer config not set in environment');
    }

    const publisher = new ResilientEventPublisher({
        ...env.rabbit.publisher,
        store: new MongoosePublisherStore()
    });

    await publisher.publish(event);
    await publisher.disconnect();
}
