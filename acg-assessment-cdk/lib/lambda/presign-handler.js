const { S3Client, HeadObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({});

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

const ALLOWED_EXTENSIONS = /\.(png|jpe?g|gif|pdf|txt|md|csv|json|log)$/i;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB cap on presigned uploads

exports.handler = async (event) => {
    if ((event.httpMethod || '').toUpperCase() === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    try {
        const body = JSON.parse(event.body || "{}");

        if (!body.folderName || !body.fileName) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: "Missing folderName or fileName" })
            };
        }

        // Reject path traversal attempts on the folder name.
        if (body.folderName.includes('/') || body.folderName.includes('..')) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: "Invalid folderName" })
            };
        }

        if (!ALLOWED_EXTENSIONS.test(body.fileName)) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: "Unsupported file extension" })
            };
        }

        // Verify the candidate folder actually exists (created by invite-handler).
        try {
            await s3.send(new HeadObjectCommand({
                Bucket: process.env.CANDIDATE_RECORDS_BUCKET,
                Key: `candidates/${body.folderName}/invite.json`
            }));
        } catch (err) {
            return {
                statusCode: 404,
                headers: corsHeaders,
                body: JSON.stringify({ error: "Unknown candidate folder" })
            };
        }

        const safeFileName = body.fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const stepPrefix = body.stepId ? `${String(body.stepId).replace(/[^a-zA-Z0-9_-]/g, '_')}/` : '';
        const key = `candidates/${body.folderName}/uploads/${stepPrefix}${safeFileName}`;

        const command = new PutObjectCommand({
            Bucket: process.env.CANDIDATE_RECORDS_BUCKET,
            Key: key,
            ContentType: body.contentType || 'application/octet-stream'
        });

        const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 600 });

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                success: true,
                uploadUrl: presignedUrl,
                fileKey: key,
                maxBytes: MAX_BYTES
            })
        };
    } catch (e) {
        console.error("Presign generation failed:", e);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: "Internal Server Error" })
        };
    }
};
