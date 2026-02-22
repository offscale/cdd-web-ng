// Mocks to satisfy both runtime execution AND TypeScript static checks.
// Uses 'any' to avoid strict signature mismatches with legacy experiment decorators.
export function Controller(_path: string): any {
    void _path;
    return () => {};
}

export function Get(_path?: string): any {
    void _path;
    return () => {};
}

export function Post(_path?: string): any {
    void _path;
    return () => {};
}

export function Param(_name?: string): any {
    void _name;
    return () => {};
}

export function Query(_name?: string): any;
export function Query(_path?: string): any;
export function Query(_arg?: string): any {
    void _arg;
    return () => {};
}

export function Header(_name?: string): any {
    void _name;
    return () => {};
}

export function Body(): any {
    return () => {};
}

export function HttpCode(_code: number): any {
    void _code;
    return () => {};
}

export interface CreateWidget {
    name: string;
}

export interface Widget {
    id: string;
    name: string;
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
        @Body() body: CreateWidget,
        @Header('X-Trace') trace?: string,
        @Query('mode') mode?: string,
    ): Widget {
        void trace;
        void mode;
        return { id, name: body.name };
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
