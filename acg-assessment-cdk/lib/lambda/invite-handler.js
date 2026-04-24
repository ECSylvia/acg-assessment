const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');

const s3 = new S3Client({});

exports.handler = async (event) => {
    try {
        const body = JSON.parse(event.body || "{}");

        if (!body.candidateEmail) {
            return {
                statusCode: 400,
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ error: "Missing candidateEmail" })
            };
        }

        const email = body.candidateEmail;
        const role = body.role || 'Agent';
        const inviteId = crypto.randomBytes(4).toString('hex');

        // Log the invite out to S3
        const recordKey = `invites/${email}_${inviteId}.json`;
        
        await s3.send(new PutObjectCommand({
            Bucket: process.env.DATA_BUCKET,
            Key: recordKey,
            Body: JSON.stringify({
                email,
                role,
                inviteId,
                generatedAtUtc: new Date().toISOString()
            }, null, 2),
            ContentType: "application/json"
        }));

        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ success: true, inviteId })
        };
    } catch (e) {
        console.error("Invite generation failed:", e);
        return {
            statusCode: 500,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: "Internal Server Error" })
        };
    }
};
