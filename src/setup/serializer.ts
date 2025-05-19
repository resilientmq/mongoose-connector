import type {EventMessage} from '@resilientmq/types__core';
import {EventSerializer} from "@resilientmq/types__mongoose-connector/src/event-serializer";

/**
 * Default serializer assuming `_id`, `payload`, and `status` fields in the Mongo model.
 */
export function getSerializer(model: any): EventSerializer {
    return {
        toStorageFormat(event: EventMessage): Record<string, any> {
            return {
                _id: event.messageId,
                payload: event.payload,
                status: event.status,
                type: event.type,
                properties: event.properties,
            };
        },

        fromStorageFormat(doc: any): EventMessage {
            return {
                id: doc._id.toString(),
                messageId: doc._id.toString(),
                payload: doc.payload,
                status: doc.status,
                type: doc.type,
                properties: doc.properties,
            };
        },

        getStatusField(): string {
            return 'status';
        },
    };
}
