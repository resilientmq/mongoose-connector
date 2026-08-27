import type {EventMessage} from '@resilientmq/core';
import type {EventSerializer, StoredEventDocument} from '../types/index.js';

interface DocumentWithToObject {
    toObject(): StoredEventDocument;
}

/** Default serializer for the connector-owned event model. */
export class StandardEventSerializer implements EventSerializer {
    /** Serializes every ResilientMQ event field used by the supported core contract. */
    toStorageFormat(event: EventMessage): StoredEventDocument {
        return {
            messageId: event.messageId,
            type: event.type ?? null,
            payload: event.payload,
            status: event.status ?? null,
            routingKey: event.routingKey ?? null,
            properties: event.properties ?? null
        };
    }

    /** Reconstructs an event from a plain or hydrated Mongoose document. */
    fromStorageFormat(document: StoredEventDocument): EventMessage {
        const source = isDocumentWithToObject(document) ? document.toObject() : document;
        const event: EventMessage = {
            messageId: String(source.messageId ?? source._id),
            payload: source.payload
        };
        if (typeof source.type === 'string') event.type = source.type;
        if (typeof source.status === 'string') event.status = source.status;
        if (typeof source.routingKey === 'string') event.routingKey = source.routingKey;
        if (source.properties && typeof source.properties === 'object') {
            event.properties = source.properties as NonNullable<EventMessage['properties']>;
        }
        return event;
    }

    /** Uses the standard status field. */
    getStatusField(): string {
        return 'status';
    }

    /** Uses the stable RabbitMQ message identifier. */
    getIdentityFilter(event: EventMessage): Record<string, unknown> {
        return {messageId: event.messageId};
    }
}

/** Shared default serializer instance retained for compatibility. */
export const DefaultEventSerializer = new StandardEventSerializer();

function isDocumentWithToObject(value: StoredEventDocument): value is StoredEventDocument & DocumentWithToObject {
    return typeof value.toObject === 'function';
}
