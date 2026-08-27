import {DefaultEventSerializer} from '../default/default-event.serializer.js';
import type {EventSerializer} from '../types/index.js';

/** Returns the standard serializer for connector-owned models. */
export function getSerializer(): EventSerializer {
    return DefaultEventSerializer;
}
