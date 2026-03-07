// tests/fixtures/ast/ignored.spec.ts

const app = {
    get: (..._args: string | number | boolean | object | undefined | null[]) => {
        void _args;
    },
};

interface MockResponse {
    send: (body: string) => void;
}

app.get('/ignored', (_req: string | number | boolean | object | undefined | null, res: MockResponse) => {
    void _req;
    res.send('ignored');
});
