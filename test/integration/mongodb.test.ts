import mongoose from 'mongoose';
import type {EventMessage} from '@resilientmq/core';
import {GenericMongooseStore, MongoConnection, getEventModel} from '../../src/index.js';

const mongodbUrl = process.env.MONGODB_URL;
if (process.env.CI && !mongodbUrl) {
    throw new Error('MONGODB_URL is required for the CI integration suite');
}
const integration = mongodbUrl ? describe : describe.skip;

integration('MongoDB integration', () => {
    const connection = new MongoConnection(mongoose);
    const publisherModel = getEventModel(`ResilientMqPublisherIntegration${process.pid}`);
    const consumerModel = getEventModel(
        `ResilientMqConsumerIntegration${process.pid}`,
        undefined,
        mongoose,
        'consumer'
    );
    const store = new GenericMongooseStore(publisherModel);
    const consumerStore = new GenericMongooseStore(consumerModel);

    beforeAll(async () => {
        await connection.connect(mongodbUrl!);
        await Promise.all([publisherModel.init(), consumerModel.init()]);
    });

    beforeEach(async () => {
        await Promise.all([publisherModel.deleteMany({}), consumerModel.deleteMany({})]);
    });

    afterAll(async () => {
        await Promise.all([publisherModel.deleteMany({}), consumerModel.deleteMany({})]);
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

    it('allows one inbox owner, isolates services, and rejects stale fencing tokens', async () => {
        const event: EventMessage = {messageId: 'inbox-race', payload: {orderId: 42}};
        const base = {
            event,
            serviceId: 'orders-consumer',
            attempt: 1,
            leaseDurationMs: 1_000,
            now: 10_000
        };
        const [first, second] = await Promise.all([
            consumerStore.claimConsumeEvent({...base, instanceId: 'replica-a'}),
            consumerStore.claimConsumeEvent({...base, instanceId: 'replica-b'})
        ]);
        const acquired = [first, second].find(claim => claim.outcome === 'acquired');
        const busy = [first, second].find(claim => claim.outcome === 'busy');
        expect(acquired?.outcome).toBe('acquired');
        expect(busy?.outcome).toBe('busy');

        const otherService = await consumerStore.claimConsumeEvent({
            ...base,
            serviceId: 'billing-consumer',
            instanceId: 'billing-a'
        });
        expect(otherService.outcome).toBe('acquired');

        const acquiredInstance = first.outcome === 'acquired' ? 'replica-a' : 'replica-b';
        const acquiredToken = first.outcome === 'acquired' ? first.fencingToken
            : second.outcome === 'acquired' ? second.fencingToken : '';
        await expect(consumerStore.transitionConsumeEvent({
            event,
            serviceId: 'orders-consumer',
            instanceId: acquiredInstance,
            fencingToken: 'stale-token',
            status: 'DONE' as never,
            now: 10_100
        })).resolves.toBe(false);
        await expect(consumerStore.transitionConsumeEvent({
            event,
            serviceId: 'orders-consumer',
            instanceId: acquiredInstance,
            fencingToken: acquiredToken,
            status: 'DONE' as never,
            now: 10_100
        })).resolves.toBe(true);
        await expect(consumerStore.claimConsumeEvent({
            ...base,
            instanceId: 'replica-c',
            now: 10_200
        })).resolves.toEqual({outcome: 'completed'});
    });

    it('recovers expired inbox leases and fences the previous process', async () => {
        const event: EventMessage = {messageId: 'inbox-recovery', payload: {orderId: 84}};
        const first = await consumerStore.claimConsumeEvent({
            event,
            serviceId: 'orders-consumer',
            instanceId: 'replica-old',
            attempt: 1,
            leaseDurationMs: 100,
            now: 20_000
        });
        const recovered = await consumerStore.claimConsumeEvent({
            event,
            serviceId: 'orders-consumer',
            instanceId: 'replica-new',
            attempt: 2,
            leaseDurationMs: 100,
            now: 20_101
        });
        expect(first.outcome).toBe('acquired');
        expect(recovered.outcome).toBe('acquired');
        if (first.outcome !== 'acquired' || recovered.outcome !== 'acquired') return;

        await expect(consumerStore.transitionConsumeEvent({
            event,
            serviceId: 'orders-consumer',
            instanceId: 'replica-old',
            fencingToken: first.fencingToken,
            status: 'DONE' as never,
            now: 20_102
        })).resolves.toBe(false);
        await expect(consumerStore.transitionConsumeEvent({
            event,
            serviceId: 'orders-consumer',
            instanceId: 'replica-new',
            fencingToken: recovered.fencingToken,
            status: 'DONE' as never,
            now: 20_102
        })).resolves.toBe(true);
    });

    it('partitions outbox claims across replicas and recovers expired ownership', async () => {
        const events = Array.from({length: 48}, (_, index): EventMessage => ({
            messageId: `outbox-race-${index}`,
            payload: {index},
            status: 'PENDING_PUBLICATION'
        }));
        for (const event of events) await store.saveEvent(event);

        const owner = {serviceId: 'orders-publisher', leaseDurationMs: 100, now: 30_000};
        const replicaIds = Array.from({length: 8}, (_, index) => `publisher-${index}`);
        const batches = await Promise.all(replicaIds.map(instanceId => store.claimPendingEvents({
            ...owner,
            instanceId,
            limit: events.length
        })));
        const claims = batches.flat();
        expect(claims).toHaveLength(events.length);
        expect(new Set(claims.map(claim => claim.event.messageId)).size).toBe(events.length);

        const stale = claims[0];
        expect(stale).toBeDefined();
        if (!stale) return;
        const recovered = await store.claimPublishEvent({
            event: stale.event,
            serviceId: owner.serviceId,
            instanceId: 'publisher-c',
            leaseDurationMs: 100,
            now: 30_101
        });
        expect(recovered).not.toBeNull();
        const staleOwner = replicaIds[batches.findIndex(batch => batch.includes(stale))];
        expect(staleOwner).toBeDefined();
        if (!staleOwner) return;
        await expect(store.completePublishedEvent({
            event: stale.event,
            serviceId: owner.serviceId,
            instanceId: staleOwner,
            fencingToken: stale.fencingToken,
            now: 30_102
        })).resolves.toBe(false);
        if (!recovered) return;
        await expect(store.completePublishedEvent({
            event: recovered.event,
            serviceId: owner.serviceId,
            instanceId: 'publisher-c',
            fencingToken: recovered.fencingToken,
            now: 30_102
        })).resolves.toBe(true);
    });

    it('honors delayed outbox release before allowing another claim', async () => {
        const event: EventMessage = {
            messageId: 'outbox-delay',
            payload: {retry: true},
            status: 'PENDING_PUBLICATION'
        };
        await store.saveEvent(event);
        const claim = await store.claimPublishEvent({
            event,
            serviceId: 'orders-publisher',
            instanceId: 'publisher-a',
            leaseDurationMs: 100,
            now: 40_000
        });
        expect(claim).not.toBeNull();
        if (!claim) return;
        await expect(store.releasePublishEvent({
            event,
            serviceId: 'orders-publisher',
            instanceId: 'publisher-a',
            fencingToken: claim.fencingToken,
            now: 40_010,
            nextAttemptAt: 41_000,
            error: new Error('broker unavailable')
        })).resolves.toBe(true);
        await expect(store.claimPublishEvent({
            event,
            serviceId: 'orders-publisher',
            instanceId: 'publisher-b',
            leaseDurationMs: 100,
            now: 40_999
        })).resolves.toBeNull();
        await expect(store.claimPublishEvent({
            event,
            serviceId: 'orders-publisher',
            instanceId: 'publisher-b',
            leaseDurationMs: 100,
            now: 41_000
        })).resolves.not.toBeNull();
    });
});
