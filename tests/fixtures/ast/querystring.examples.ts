// tests/fixtures/ast/querystring.examples.ts

const app = {
    get: (..._args: unknown[]) => {
        void _args;
    },
};

interface MockRequest {
    url: string;
}

interface MockResponse {
    send: (body: string) => void;
}

/**
 * Raw querystring example.
 *
 * @querystring {"name":"rawQuery","contentType":"application/x-www-form-urlencoded","encoding":{"tags":{"style":"pipeDelimited","explode":false}}}
 * @paramExample rawQuery {"__oasExample":{"serializedValue":"foo=bar&baz=qux"}}
 */
export function rawQueryExample(req: MockRequest, res: MockResponse) {
    const raw = req.url;
    res.send(raw);
}

app.get('/raw-query-example', rawQueryExample);
