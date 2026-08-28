import type {EventMessage} from '@resilientmq/core';

/** Provider-neutral MongoDB document used by serializer implementations. */
export type StoredEventDocument = Record<string, unknown>;

/** Transforms events and defines how their identity and status are stored. */
export interface EventSerializer<TDocument extends StoredEventDocument = StoredEventDocument> {
    /** Converts an application event into a MongoDB document. */
    toStorageFormat(event: EventMessage): TDocument;

    /** Converts a MongoDB document into an application event. */
    fromStorageFormat(document: TDocument): EventMessage;

    /** Returns the MongoDB path containing the event status. */
    getStatusField(): string;

    /** Returns the query that uniquely identifies one event. */
    getIdentityFilter?(event: EventMessage): Record<string, unknown>;
}
