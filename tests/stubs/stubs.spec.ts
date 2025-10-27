import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
// FIX: Correctly separate imports for emit and parse functions
import { emitComponent } from '../../src/component/emit.js';
import { parseComponent } from '../../src/component/parse.js';
import { emitRoute } from '../../src/route/emit.js';
import { parseRoute } from '../../src/route/parse.js';
import { emitTest } from '../../src/test/emit.js';
import { parseTest } from '../../src/test/parse.js';

describe('Unit: Stub Implementations', () => {
    let spy: vi.SpyInstance;

    beforeEach(() => {
        spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        spy.mockRestore();
    });

    it('should call console.log for component stubs', () => {
        emitComponent();
        expect(spy).toHaveBeenCalledWith("Component emitter is not implemented.");
        parseComponent();
        expect(spy).toHaveBeenCalledWith("Component parser is not implemented.");
    });

    it('should call console.log for route stubs', () => {
        emitRoute();
        expect(spy).toHaveBeenCalledWith("Route emitter is not implemented.");
        parseRoute();
        expect(spy).toHaveBeenCalledWith("Route parser is not implemented.");
    });

    it('should call console.log for test stubs', () => {
        emitTest();
        expect(spy).toHaveBeenCalledWith("Test emitter is not implemented.");
        parseTest();
        expect(spy).toHaveBeenCalledWith("Test parser is not implemented.");
    });
});
