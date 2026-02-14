const app = {
    get: (..._args: any[]) => {
        void _args;
    },
};

/**
 * Raw querystring example.
 *
 * @querystring {"name":"rawQuery","contentType":"application/x-www-form-urlencoded","encoding":{"tags":{"style":"pipeDelimited","explode":false}}}
 * @paramExample rawQuery {"__oasExample":{"serializedValue":"foo=bar&baz=qux"}}
 */
export function rawQueryExample(req: any, res: any) {
    const raw = req.url;
    res.send(raw);
}

app.get('/raw-query-example', rawQueryExample);
