import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { emitComponent } from '@src/component/emit.js';
import { parseComponent } from '@src/component/parse.js';
import { emitRoute } from '@src/route/emit.js';
import { parseRoute } from '@src/route/parse.js';
import { emitTest } from '@src/test/emit.js';
import { parseTest } from '@src/test/parse.js';

describe('Not Implemented Stubs', () => {
    let spy: Mock<(...args: any[]) => void>;

    beforeEach(() => {
        spy = vi.spyOn(console, 'log').mockImplementation(() => {
        });
    });

    afterEach(() => {
        spy.mockRestore();
    });

    it('component stubs should log a message', () => {
        emitComponent();
        expect(spy).toHaveBeenCalledWith("Component emitter is not implemented.");
        parseComponent();
        expect(spy).toHaveBeenCalledWith("Component parser is not implemented.");
    });

    it('route stubs should log a message', () => {
        emitRoute();
        expect(spy).toHaveBeenCalledWith("Route emitter is not implemented.");
        parseRoute();
        expect(spy).toHaveBeenCalledWith("Route parser is not implemented.");
    });

    it('test stubs should log a message', () => {
        emitTest();
        expect(spy).toHaveBeenCalledWith("Test emitter is not implemented.");
        parseTest();
        expect(spy).toHaveBeenCalledWith("Test parser is not implemented.");
    });
});
