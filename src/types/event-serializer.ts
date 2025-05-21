import {EventMessage} from "@resilientmq/core/types";

/**
 * Serializer functions for transforming between app-level and DB-level event structures.
 */
export interface EventSerializer<T = any> {
    toStorageFormat(event: EventMessage): Record<string, any>;

    fromStorageFormat(doc: Record<string, any>): EventMessage;

    getStatusField(): string;
}