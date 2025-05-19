import type {EventMessage} from '@resilientmq/types__core';
import {EventSerializer} from "@resilientmq/types__mongoose-connector/src/event-serializer";

export const DefaultEventSerializer: EventSerializer = {
    toStorageFormat(event: EventMessage): any {
        return {...event};
    },
    fromStorageFormat(doc: any): EventMessage {
        const {_id, ...rest} = doc.toObject ? doc.toObject() : doc;
        return {
            ...rest,
            messageId: rest.messageId ?? _id,
        };
    },
    getStatusField(): string {
        return 'status';
    }
};
