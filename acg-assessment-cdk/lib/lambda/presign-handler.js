const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({});

exports.handler = async (event) => {
    try {
        const body = JSON.parse(event.body || "{}");

        if (!body.folderName || !body.fileName) {
            return {
                statusCode: 400,
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ error: "Missing folderName or fileName" })
            };
        }

        const safeFileName = body.fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const key = `candidates/${body.folderName}/uploads/${safeFileName}`;

        const command = new PutObjectCommand({
            Bucket: process.env.CANDIDATE_RECORDS_BUCKET,
            Key: key,
            ContentType: body.contentType || 'application/octet-stream'
        });

        const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ 
                success: true, 
                uploadUrl: presignedUrl,
                fileKey: key 
            })
        };
    } catch (e) {
        console.error("Presign generation failed:", e);
        return {
            statusCode: 500,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: "Internal Server Error" })
        };
    }
};
