const app = {
    get: (..._args: any[]) => {
        void _args;
    },
    post: (..._args: any[]) => {
        void _args;
    },
    put: (..._args: any[]) => {
        void _args;
    },
    patch: (..._args: any[]) => {
        void _args;
    },
    delete: (..._args: any[]) => {
        void _args;
    },
    query: (..._args: any[]) => {
        void _args;
    },
    copy: (..._args: any[]) => {
        void _args;
    },
};
const router = {
    route: (..._args: any[]) => {
        void _args;
        return {
            patch: (..._routeArgs: any[]) => {
                void _routeArgs;
            },
        };
    },
};
const config = { version: 'v1' };
const middleware = (_req: any, _res: any, next: any) => {
    void _req;
    void _res;
    next();
};

/**
 * Get user by id.
 *
 * Returns the user payload.
 *
 * @tags Users, Accounts
 * @deprecated
 */
export function getUser(req: any, res: any) {
    const { id } = req.params;
    const search = req.query.search;
    const token = req.headers['x-token'];
    const requestId = req.get('X-Request-Id');
    const session = req.cookies.session;
    res.status(200).json({ id, search, token, session, requestId });
}

app.get('/users/:id', getUser);

router.route('/projects/:projectId').patch(function updateProject(req: any, res: any) {
    const { projectId } = req.params;
    res.type('application/xml').status(200).send('<ok/>');
});

app.post('/messages', (req: any, res: any) => {
    const body = req.body;
    const { payload } = req.body;
    if (req.is('application/json')) {
        // json branch
    }
    if (body) {
        // body branch
    }
    if (payload) {
        // payload branch
    }
    res.send('ok');
});

app.get(`${config.version}/status`, (_req: any, res: any) => {
    void _req;
    res.send('status');
});

app.put('/array', [
    middleware,
    function handleArray(_req: any, res: any) {
        void _req;
        res.set('Content-Type', 'text/csv').send('id,name');
    },
]);

app.get('/bound/:id', ({ params, query, body }: any, res: any) => {
    const userId = params.id;
    const filter = query.filter;
    if (body) {
        // body branch
    }
    if (userId || filter) {
        // use values
    }
    res.end();
});

app.post('/object', (_req: any, res: any) => {
    void _req;
    res.send({ ok: true });
});

app.delete('/remove/:id', (_req: any, res: any) => {
    void _req;
    res.sendStatus(204);
});

/**
 * Local handler summary.
 *
 * Local handler description.
 */
const localHandler = (req: any, res: any) => {
    void req;
    res.send('local');
};

app.patch('/local', localHandler);

app.get('/string-status', (_req: any, res: any) => {
    void _req;
    res.status('202').json({ ok: true });
});

app.get(`/literal`, (_req: any, res: any) => {
    void _req;
    res.send('literal');
});

app.query('/search', (req: any, res: any) => {
    const q = req.query.q;
    res.json({ q });
});

app.copy('/files/:id', (req: any, res: any) => {
    const { id } = req.params;
    res.status(201).json({ id });
});

export interface CreateMessage {
    message: string;
}

export enum MessageStatus {
    Sent = 'sent',
    Failed = 'failed',
}
