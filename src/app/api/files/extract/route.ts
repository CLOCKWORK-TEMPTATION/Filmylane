import { NextRequest, NextResponse } from 'next/server';
import { extractFileContent } from '@/utils/file-extraction';
import { FileExtractionResult } from '@/types/file-import';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 }
            );
        }

        // Save file to a temporary location for processing
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Create temp directory if needed or use system temp
        const tempDir = os.tmpdir();
        const tempFilePath = path.join(tempDir, `upload-${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.name)}`);

        await fs.writeFile(tempFilePath, buffer);

        try {
            const result: FileExtractionResult = await extractFileContent(tempFilePath, file.name);

            // Clean up temp file
            await fs.unlink(tempFilePath).catch(() => { }); // Ignore cleanup errors

            if (!result.success) {
                return NextResponse.json(result, { status: 422 }); // Unprocessable Entity if extraction failed intentionally
            }

            return NextResponse.json(result);

        } catch (extractionError: any) {
            // Clean up
            await fs.unlink(tempFilePath).catch(() => { });

            console.error('Extraction error:', extractionError);
            return NextResponse.json(
                { error: extractionError.message || 'Extraction failed internal error', success: false } as FileExtractionResult,
                { status: 500 }
            );
        }

    } catch (e: any) {
        console.error('Upload error:', e);
        return NextResponse.json(
            { error: 'Failed to process upload', success: false } as FileExtractionResult,
            { status: 500 }
        );
    }
}
