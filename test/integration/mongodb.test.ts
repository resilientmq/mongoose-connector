import mongoose from 'mongoose';
import type {EventMessage} from '@resilientmq/core/dist/types/index.js';
import {GenericMongooseStore, MongoConnection, getEventModel} from '../../src/index.js';

const mongodbUrl = process.env.MONGODB_URL;
if (process.env.CI && !mongodbUrl) {
    throw new Error('MONGODB_URL is required for the CI integration suite');
}
const integration = mongodbUrl ? describe : describe.skip;

integration('MongoDB integration', () => {
    const connection = new MongoConnection(mongoose);
    const model = getEventModel(`ResilientMqIntegration${process.pid}`);
    const store = new GenericMongooseStore(model);

    beforeAll(async () => {
        await connection.connect(mongodbUrl!);
        await model.init();
    });

    beforeEach(async () => {
        await model.deleteMany({});
    });

    afterAll(async () => {
        await model.deleteMany({});
        await connection.disconnect();
    });

    it('enforces unique message IDs and retrieves ordered pending events', async () => {
        const first: EventMessage = {messageId: 'first', payload: {position: 1}, status: 'PENDING_PUBLICATION'};
        const second: EventMessage = {messageId: 'second', payload: {position: 2}, status: 'PENDING_PUBLICATION'};
        await expect(store.saveEventIfNotExists(first)).resolves.toBe(true);
        await expect(store.saveEventIfNotExists(first)).resolves.toBe(false);
        await new Promise(resolve => setTimeout(resolve, 5));
        await store.saveEvent(second);

        const pending = await store.getPendingEvents('PENDING_PUBLICATION' as never, 10);
        expect(pending.map(event => event.messageId)).toEqual(['first', 'second']);
        await store.updateEventStatus(first, 'PUBLISHED' as never);
        expect((await store.getEvent(first))?.status).toBe('PUBLISHED');
    });

    it('queries exact statuses and applies Core 2 bulk transitions', async () => {
        const pending: EventMessage = {
            messageId: 'bulk-pending',
            payload: {position: 1},
            status: 'PENDING_PUBLICATION'
        };
        const failed: EventMessage = {
            messageId: 'bulk-failed',
            payload: {position: 2},
            status: 'ERROR'
        };
        await store.saveEvent(pending);
        await store.saveEvent(failed);

        const initialPending = await store.getEventsByStatus('PENDING_PUBLICATION' as never);
        expect(initialPending.map(event => event.messageId)).toEqual(['bulk-pending']);

        await store.batchUpdateEventStatus([
            {event: pending, status: 'PUBLISHED' as never},
            {event: failed, status: 'PENDING_PUBLICATION' as never}
        ]);

        expect((await store.getEvent(pending))?.status).toBe('PUBLISHED');
        expect((await store.getEvent(failed))?.status).toBe('PENDING_PUBLICATION');
    });
});
