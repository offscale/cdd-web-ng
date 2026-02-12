function Controller(_path: string): ClassDecorator {
    void _path;
    return () => {};
}

function Get(_path?: string): MethodDecorator {
    void _path;
    return () => {};
}

function Post(_path?: string): MethodDecorator {
    void _path;
    return () => {};
}

function Param(_name?: string): ParameterDecorator {
    void _name;
    return () => {};
}

function Query(_name?: string): ParameterDecorator;
function Query(_path?: string): MethodDecorator;
function Query(_arg?: string): ParameterDecorator | MethodDecorator {
    void _arg;
    return () => {};
}

function Header(_name?: string): ParameterDecorator {
    void _name;
    return () => {};
}

function Body(): ParameterDecorator {
    return () => {};
}

function HttpCode(_code: number): MethodDecorator {
    void _code;
    return () => {};
}

@Controller('/admin')
export class AdminController {
    /**
     * Create widget.
     *
     * Accepts the widget body.
     */
    @Post('/widgets/:id')
    @HttpCode(201)
    create(
        @Param('id') id: string,
        @Body() body: unknown,
        @Header('X-Trace') trace?: string,
        @Query('mode') mode?: string,
    ) {
        return { id, body, trace, mode };
    }

    @Get()
    list() {
        return [];
    }

    @Query('/search')
    search(@Query('q') q?: string) {
        return { q };
    }
}
