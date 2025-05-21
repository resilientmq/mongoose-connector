import {Schema, model, Model} from 'mongoose';
import {EventMessage} from "@resilientmq/core/types";
/**
 * Returns a Mongoose model for EventMessage.
 *
 * @param name - The name of the model to register or retrieve.
 * @param customModel - Optional custom Mongoose model to use instead.
 * @returns A Mongoose model for events.
 */
export function getEventModel<T extends EventMessage = EventMessage>(
    name: string,
    customModel?: Model<T>
): Model<T> {
    if (customModel) return customModel;

    const DefaultEventSchema = new Schema<T>(
        {
            id: {type: String, required: true},
            messageId: {type: String, required: true},
            type: {type: String, required: true},
            payload: {type: Schema.Types.Mixed, required: true},
            status: {type: String, required: true},
            properties: {type: Schema.Types.Mixed}
        },
        {timestamps: true}
    );

    return model<T>(name, DefaultEventSchema);
}
