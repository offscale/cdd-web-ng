const app = {
    get: (..._args: any[]) => {
        void _args;
    },
};

app.get('/ignored', (_req: any, res: any) => {
    void _req;
    res.send('ignored');
});
