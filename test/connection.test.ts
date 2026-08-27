import mongoose from 'mongoose';
import {MongoConnection} from '../src/index.js';

describe('MongoConnection', () => {
    it('shares concurrent startup and follows the Mongoose ready state', async () => {
        let readyState = 0;
        let release: (() => void) | undefined;
        const pending = new Promise<void>(resolve => { release = resolve; });
        const client = {
            connection: {get readyState() { return readyState; }},
            connect: vi.fn(async () => {
                await pending;
                readyState = 1;
            }),
            disconnect: vi.fn(async () => { readyState = 0; })
        } as unknown as typeof mongoose;
        const connection = new MongoConnection(client);

        const first = connection.connect('mongodb://localhost/test');
        const second = connection.connect('mongodb://localhost/test');
        expect(client.connect).toHaveBeenCalledTimes(1);
        release?.();
        await Promise.all([first, second]);
        expect(connection.status).toBe(true);
        await connection.connect('mongodb://localhost/test');
        expect(client.connect).toHaveBeenCalledTimes(1);
        await connection.disconnect();
        expect(client.disconnect).toHaveBeenCalledTimes(1);
        await connection.disconnect();
        expect(client.disconnect).toHaveBeenCalledTimes(1);
    });

    it('returns one process-wide default manager', () => {
        expect(MongoConnection.getInstance()).toBe(MongoConnection.getInstance());
        expect(MongoConnection.getInstance().client).toBe(mongoose);
    });
});
