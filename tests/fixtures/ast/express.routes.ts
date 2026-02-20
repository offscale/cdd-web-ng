// tests/fixtures/ast/express.routes.ts

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
type Request<Params = any, _ResBody = any, ReqBody = any, ReqQuery = any> = {
    params: Params;
    query: ReqQuery;
    body: ReqBody;
    headers: Record<string, string>;
    cookies: Record<string, string>;
    get: (name: string) => string | undefined;
    is: (type: string) => boolean;
};
type Response<ResBody = any> = {
    json: (body: ResBody) => void;
    send: (body?: ResBody) => void;
    status: (code: number | string) => Response<ResBody>;
    type: (type: string) => Response<ResBody>;
    set: (name: string, value: string) => Response<ResBody>;
    end: () => void;
    sendStatus: (code: number) => void;
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
 * @tag {"name":"Users","summary":"User operations","kind":"nav"}
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
    void projectId;
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

export interface CreateMessageBody {
    message: string;
}

export interface MessageReceipt {
    id: string;
}

export function typedMessages(req: Request<unknown, MessageReceipt, CreateMessageBody>, res: Response<MessageReceipt>) {
    const { message } = req.body;
    res.status(201).json({ id: message });
}

app.post('/typed-messages', typedMessages);

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

/**
 * Secure endpoint.
 *
 * @see https://example.com/secure Secure docs
 * @server {"url":"https://api.example.com/v2","description":"Production","name":"prod","variables":{"version":{"default":"v2"}}}
 * @server https://staging.example.com/v2 Staging
 * @security ApiKey
 * @security OAuth2 read:items,write:items
 * @x-feature-flag "beta"
 */
export function secureEndpoint(_req: any, res: any) {
    res.json({ ok: true });
}

app.get('/secure', secureEndpoint);

/**
 * Documented response hints.
 *
 * @operationId fetchDocumented
 * @response 202 application/json Accepted payload
 * @response 404 text/plain Not found
 * @responseSummary 202 Accepted summary
 * @param id Documented id.
 */
export function documentedEndpoint(req: any, res: any) {
    const { id } = req.params;
    res.status(202).json({ id });
}

app.get('/documented/:id', documentedEndpoint);

/**
 * Raw querystring endpoint.
 *
 * @querystring rawQuery application/x-www-form-urlencoded
 */
export function rawQueryEndpoint(req: any, res: any) {
    const raw = req.url;
    res.send(raw);
}

app.get('/raw-query', rawQueryEndpoint);

export interface CreateMessage {
    message: string;
}

export enum MessageStatus {
    Sent = 'sent',
    Failed = 'failed',
}
