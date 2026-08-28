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
        expect(first.schema.path('messageId').options).toMatchObject({required: true, unique: true});
        expect(first.schema.path('id')).toBeUndefined();
        expect(first.schema.path('routingKey')).toBeDefined();
    });
});
