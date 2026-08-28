import type {EventMessage} from '@resilientmq/core';
import type {Model} from 'mongoose';
import {GenericMongooseStore, type EventSerializer} from '../src/index.js';

const event = (messageId: string): EventMessage => ({messageId, payload: {messageId}, status: 'PENDING'});

describe('GenericMongooseStore', () => {
    it('implements CRUD, ordered batches, and bulk status updates', async () => {
        const first = document(event('one'));
        const second = document(event('two'));
        const fake = fakeModel({findOne: first, find: [first, second]});
        const store = new GenericMongooseStore(fake.model);

        await store.saveEvent(event('one'));
        await expect(store.saveEventIfNotExists(event('two'))).resolves.toBe(true);
        await store.updateEventStatus(event('one'), 'DONE' as never);
        await expect(store.getEvent(event('one'))).resolves.toMatchObject({messageId: 'one'});
        await expect(store.getPendingEvents('PENDING' as never, 1.9)).resolves.toHaveLength(2);
        await expect(store.getEventsByStatus('PENDING' as never)).resolves.toHaveLength(2);
        await store.batchUpdateEventStatus([
            {event: event('one'), status: 'DONE' as never},
            {event: event('two'), status: 'ERROR' as never}
        ]);
        await store.deleteEvent(event('one'));

        expect(fake.create).toHaveBeenCalledTimes(2);
        expect(fake.updateOne).toHaveBeenCalledWith(
            {messageId: 'one'},
            {$set: {status: 'DONE'}}
        );
        expect(fake.limit).toHaveBeenCalledWith(1);
        expect(fake.bulkWrite).toHaveBeenCalledTimes(1);
        expect(fake.deleteOne).toHaveBeenCalledWith({messageId: 'one'});
    });

    it('uses custom identity and status paths', async () => {
        const serializer: EventSerializer = {
            toStorageFormat: value => ({_id: value.messageId, lifecycle: value.status}),
            fromStorageFormat: value => ({messageId: String(value._id), payload: null, status: String(value.lifecycle)}),
            getStatusField: () => 'lifecycle',
            getIdentityFilter: value => ({_id: value.messageId})
        };
        const fake = fakeModel({findOne: {_id: 'custom', lifecycle: 'DONE'}});
        const store = new GenericMongooseStore(fake.model, serializer);

        await expect(store.getEvent(event('custom'))).resolves.toEqual({messageId: 'custom', payload: null, status: 'DONE'});
        await store.updateEventStatus(event('custom'), 'DONE' as never);
        expect(fake.updateOne).toHaveBeenCalledWith({_id: 'custom'}, {$set: {lifecycle: 'DONE'}});
    });

    it('handles missing rows, duplicate inserts, empty batches, and database failures', async () => {
        const duplicate = Object.assign(new Error('duplicate'), {code: 11_000});
        const fake = fakeModel({findOne: null, createError: duplicate});
        const store = new GenericMongooseStore(fake.model);

        await expect(store.getEvent(event('missing'))).resolves.toBeNull();
        await expect(store.saveEventIfNotExists(event('duplicate'))).resolves.toBe(false);
        await store.batchUpdateEventStatus([]);
        expect(fake.bulkWrite).not.toHaveBeenCalled();

        fake.create.mockRejectedValueOnce(new Error('offline'));
        await expect(store.saveEventIfNotExists(event('offline'))).rejects.toThrow('offline');
    });

    it('acquires, reports, and transitions fenced inbox leases', async () => {
        const leaseExpiresAt = new Date(2_000);
        const fake = fakeModel({
            findOneAndUpdate: [document(event('acquired')), null, null],
            findOneSequence: [
                document({...event('done'), status: 'DONE'}),
                {toObject: () => ({...event('busy'), status: 'PROCESSING', leaseExpiresAt})}
            ],
            updateOneResults: [{matchedCount: 1}, {matchedCount: 0}]
        });
        const store = new GenericMongooseStore(fake.model);
        const request = {
            event: event('acquired'),
            serviceId: 'service',
            instanceId: 'instance-a',
            attempt: 2,
            leaseDurationMs: 1_000,
            now: 1_000
        };

        await expect(store.claimConsumeEvent(request)).resolves.toMatchObject({
            outcome: 'acquired',
            leaseExpiresAt: 2_000
        });
        await expect(store.claimConsumeEvent({...request, event: event('done')})).resolves.toEqual({
            outcome: 'completed'
        });
        await expect(store.claimConsumeEvent({...request, event: event('busy')})).resolves.toEqual({
            outcome: 'busy',
            leaseExpiresAt: 2_000
        });

        const transition = {
            event: event('acquired'),
            serviceId: 'service',
            instanceId: 'instance-a',
            fencingToken: 'token',
            status: 'DONE' as never,
            now: 1_500
        };
        await expect(store.transitionConsumeEvent(transition)).resolves.toBe(true);
        await expect(store.transitionConsumeEvent(transition)).resolves.toBe(false);
    });

    it('stabilizes inbox contention and preserves database failures', async () => {
        const duplicate = Object.assign(new Error('duplicate'), {code: 11_000});
        const contended = fakeModel({
            findOneAndUpdate: [duplicate],
            findOneSequence: [{status: 'PROCESSING', leaseExpiresAt: 2_500}]
        });
        const request = {
            event: event('contended'),
            serviceId: 'service',
            instanceId: 'instance',
            attempt: 1,
            leaseDurationMs: 1_000,
            now: 1_000
        };
        await expect(new GenericMongooseStore(contended.model).claimConsumeEvent(request)).resolves.toEqual({
            outcome: 'busy',
            leaseExpiresAt: 2_500
        });

        const deleted = fakeModel({
            findOneAndUpdate: [null, null, null, null],
            findOneSequence: [null, null, null, null]
        });
        await expect(new GenericMongooseStore(deleted.model).claimConsumeEvent(request)).rejects.toThrow(
            /could not stabilize/
        );

        const offline = fakeModel({findOneAndUpdate: [new Error('offline')]});
        await expect(new GenericMongooseStore(offline.model).claimConsumeEvent(request)).rejects.toThrow('offline');
    });

    it('claims and applies fenced outbox transitions', async () => {
        const fake = fakeModel({
            findOneAndUpdate: [
                document(event('known')),
                document(event('batch-1')),
                document(event('batch-2')),
                null
            ],
            updateOneResults: [{matchedCount: 1}, {matchedCount: 1}]
        });
        const store = new GenericMongooseStore(fake.model);
        const owner = {
            serviceId: 'publisher',
            instanceId: 'instance-p',
            leaseDurationMs: 1_000,
            now: 5_000
        };

        await expect(store.claimPublishEvent({...owner, event: event('known')})).resolves.toMatchObject({
            event: {messageId: 'known'},
            leaseExpiresAt: 6_000
        });
        await expect(store.claimPendingEvents({...owner, limit: 5})).resolves.toMatchObject([
            {event: {messageId: 'batch-1'}},
            {event: {messageId: 'batch-2'}}
        ]);

        const transition = {
            ...owner,
            event: event('known'),
            fencingToken: 'token'
        };
        await expect(store.completePublishedEvent(transition)).resolves.toBe(true);
        await expect(store.releasePublishEvent({
            ...transition,
            nextAttemptAt: 8_000,
            error: new Error('offline')
        })).resolves.toBe(true);
        await expect(store.claimPendingEvents({...owner, limit: 0})).resolves.toEqual([]);
    });
});

function document(value: EventMessage): Record<string, unknown> {
    return {toObject: () => ({...value})};
}

function fakeModel(options: {
    findOne?: unknown;
    findOneSequence?: unknown[];
    find?: unknown[];
    createError?: Error;
    findOneAndUpdate?: unknown[];
    updateOneResults?: Array<{matchedCount: number}>;
} = {}) {
    const findOneSequence = [...(options.findOneSequence ?? [])];
    const execOne = vi.fn(async () => findOneSequence.length > 0
        ? findOneSequence.shift()
        : options.findOne ?? null);
    const execMany = vi.fn(async () => options.find ?? []);
    const limit = vi.fn(() => ({exec: execMany}));
    const sortMany = vi.fn(() => ({limit, exec: execMany}));
    const create = options.createError
        ? vi.fn().mockRejectedValue(options.createError)
        : vi.fn().mockResolvedValue(undefined);
    const updateOneResults = [...(options.updateOneResults ?? [])];
    const updateOne = vi.fn(() => ({
        exec: vi.fn().mockResolvedValue(updateOneResults.shift() ?? {matchedCount: 1})
    }));
    const deleteOne = vi.fn(() => ({exec: vi.fn().mockResolvedValue(undefined)}));
    const findOne = vi.fn(() => ({exec: execOne}));
    const find = vi.fn(() => ({sort: sortMany}));
    const findOneAndUpdateResults = [...(options.findOneAndUpdate ?? [])];
    const findOneAndUpdate = vi.fn(() => ({
        exec: vi.fn(async () => {
            const result = findOneAndUpdateResults.shift() ?? null;
            if (result instanceof Error) throw result;
            return result;
        })
    }));
    const bulkWrite = vi.fn().mockResolvedValue(undefined);
    return {
        model: {create, updateOne, deleteOne, findOne, find, findOneAndUpdate, bulkWrite} as unknown as Model<any>,
        create,
        updateOne,
        deleteOne,
        findOne,
        find,
        findOneAndUpdate,
        limit,
        bulkWrite
    };
}
