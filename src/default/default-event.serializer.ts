import {EventSerializer} from "../types";
import {EventMessage} from "@resilientmq/core/types";

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
