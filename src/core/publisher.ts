import { ResilientEventPublisher } from '@resilientmq/core';
import { Environment } from '../setup/environment';
import {GenericMongooseStore} from "../store/generic-store";
import {EventMessage} from "@resilientmq/core/types";
import {getEventModel} from "../setup/event-model";

/**
 * Publishes an event using the resilient publisher with the shared environment config.
 *
 * @param event - The event to publish.
 */
export async function publish(event: EventMessage): Promise<void> {
    const env = Environment.get();

    if (!env.rabbit.publisher.connection) {
        throw new Error('[ResilientMQ] Publisher config not set in environment');
    }

    const publisher = new ResilientEventPublisher({
        ...env.rabbit.publisher,
        store: new GenericMongooseStore(getEventModel('publisher_event_log', env.rabbit.consumer?.model))
    });

    await publisher.publish(event);
    await publisher.disconnect();
}
