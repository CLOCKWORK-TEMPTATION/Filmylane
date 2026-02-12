declare module 'pdf-parse' {
    function pdf(dataBuffer: Buffer, options?: Record<string, unknown>): Promise<{
        numpages: number;
        numrender: number;
        info: Record<string, unknown>;
        metadata: unknown;
        version: string;
        text: string;
    }>;
    export = pdf;
}
