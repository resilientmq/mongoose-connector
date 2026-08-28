import type {EventMessage} from '@resilientmq/core/dist/types/index.js';
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
});

function document(value: EventMessage): Record<string, unknown> {
    return {toObject: () => ({...value})};
}

function fakeModel(options: {
    findOne?: unknown;
    find?: unknown[];
    createError?: Error;
} = {}) {
    const execOne = vi.fn(async () => options.findOne ?? null);
    const execMany = vi.fn(async () => options.find ?? []);
    const limit = vi.fn(() => ({exec: execMany}));
    const sortMany = vi.fn(() => ({limit, exec: execMany}));
    const create = options.createError
        ? vi.fn().mockRejectedValue(options.createError)
        : vi.fn().mockResolvedValue(undefined);
    const updateOne = vi.fn(() => ({exec: vi.fn().mockResolvedValue(undefined)}));
    const deleteOne = vi.fn(() => ({exec: vi.fn().mockResolvedValue(undefined)}));
    const findOne = vi.fn(() => ({exec: execOne}));
    const find = vi.fn(() => ({sort: sortMany}));
    const bulkWrite = vi.fn().mockResolvedValue(undefined);
    return {
        model: {create, updateOne, deleteOne, findOne, find, bulkWrite} as unknown as Model<any>,
        create,
        updateOne,
        deleteOne,
        findOne,
        find,
        limit,
        bulkWrite
    };
}
