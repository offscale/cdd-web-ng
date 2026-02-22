// tests/fixtures/ast/ignored.spec.ts

const app = {
    get: (..._args: unknown[]) => {
        void _args;
    },
};

interface MockResponse {
    send: (body: string) => void;
}

app.get('/ignored', (_req: unknown, res: MockResponse) => {
    void _req;
    res.send('ignored');
});
