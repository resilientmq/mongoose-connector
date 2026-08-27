import type {EventMessage} from '@resilientmq/core/dist/types/index.js';
import {Environment} from '../setup/environment.js';

/** Publishes through the long-lived publisher configured by `setEnvironment`. */
export async function publish(event: EventMessage, options?: {storeOnly?: boolean}): Promise<void> {
    await Environment.getConnector().publish(event, options);
}

/** Stops functional consumer, publisher, and MongoDB resources. */
export async function disconnect(): Promise<void> {
    await Environment.reset();
}
