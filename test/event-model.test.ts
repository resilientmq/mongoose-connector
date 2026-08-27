import type {Model} from 'mongoose';
import {getEventModel} from '../src/index.js';

describe('getEventModel', () => {
    it('uses custom models and caches connector-owned models', () => {
        const custom = {} as Model<any>;
        expect(getEventModel('ignored', custom)).toBe(custom);

        const name = `ResilientMqEvent${Date.now()}`;
        const first = getEventModel(name);
        const second = getEventModel(name);
        expect(second).toBe(first);
        expect(first.schema.path('messageId').options).toMatchObject({required: true});
        const publisherIdentity = first.schema.indexes().find(([fields]) => fields.messageId === 1);
        expect(publisherIdentity?.[1]).toMatchObject({unique: true});
        expect(first.schema.path('id')).toBeUndefined();
        expect(first.schema.path('routingKey')).toBeDefined();
        expect(first.schema.path('fencingToken')).toBeDefined();
        expect(first.schema.path('leaseExpiresAt')).toBeDefined();
    });

    it('uses service and message identity for consumer models', () => {
        const model = getEventModel(`ResilientMqConsumer${Date.now()}`, undefined, undefined, 'consumer');
        const consumerIdentity = model.schema.indexes().find(([fields]) => (
            fields.serviceId === 1 && fields.messageId === 1
        ));
        expect(consumerIdentity?.[1]).toMatchObject({unique: true});
    });
});
