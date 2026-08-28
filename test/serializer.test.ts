import type {EventMessage} from '@resilientmq/core';
import {DefaultEventSerializer, StandardEventSerializer, getSerializer} from '../src/index.js';

describe('StandardEventSerializer', () => {
    it('round-trips every supported event field', () => {
        const serializer = new StandardEventSerializer();
        const event: EventMessage = {
            messageId: 'event-1',
            type: 'order.created',
            payload: {orderId: 42},
            status: 'PENDING_PUBLICATION',
            routingKey: 'orders.created',
            properties: {headers: {traceId: 'trace-1'}}
        };

        expect(serializer.fromStorageFormat(serializer.toStorageFormat(event))).toEqual(event);
        expect(serializer.getIdentityFilter(event)).toEqual({messageId: 'event-1'});
        expect(serializer.getStatusField()).toBe('status');
    });

    it('accepts hydrated documents and omits null optional fields', () => {
        const serializer = new StandardEventSerializer();
        expect(serializer.fromStorageFormat({
            toObject: () => ({_id: 'legacy-id', payload: null})
        })).toEqual({messageId: 'legacy-id', payload: null});
    });

    it('retains the shared compatibility serializer', () => {
        expect(DefaultEventSerializer).toBeInstanceOf(StandardEventSerializer);
        expect(getSerializer()).toBe(DefaultEventSerializer);
    });
});
