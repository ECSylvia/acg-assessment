const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const { recordActivity } = require('./activity-log-util');

const s3 = new S3Client({});

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function requireAdminAuth(event) {
    const expected = process.env.ADMIN_API_TOKEN;
    if (!expected) return { ok: true };
    const headers = event.headers || {};
    const auth = headers['authorization'] || headers['Authorization'] || '';
    const provided = auth.replace(/^Bearer\s+/i, '').trim();
    if (!provided || provided !== expected) {
        return { ok: false };
    }
    return { ok: true };
}

exports.handler = async (event) => {
    if ((event.httpMethod || '').toUpperCase() === 'OPTIONS') {
        return { statusCode: 204, headers: corsHeaders, body: '' };
    }

    const auth = requireAdminAuth(event);
    if (!auth.ok) {
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    try {
        const body = JSON.parse(event.body || "{}");

        if (!body.candidateEmail) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: "Missing candidateEmail" })
            };
        }

        const email = body.candidateEmail;
        const name = body.candidateName || "Unknown";
        const role = body.role || 'Agent';
        const inviteId = crypto.randomBytes(4).toString('hex');

        const safeName = name.replace(/[^a-zA-Z0-9]/g, '_');
        const folderName = `${safeName}_${inviteId}`;

        const recordKey = `candidates/${folderName}/invite.json`;

        await s3.send(new PutObjectCommand({
            Bucket: process.env.CANDIDATE_RECORDS_BUCKET,
            Key: recordKey,
            Body: JSON.stringify({
                name,
                email,
                role,
                inviteId,
                folderName,
                generatedAtUtc: new Date().toISOString(),
                generatedBy: body.recruiter || 'unknown-recruiter'
            }, null, 2),
            ContentType: "application/json"
        }));

        await s3.send(new PutObjectCommand({
            Bucket: process.env.CANDIDATE_RECORDS_BUCKET,
            Key: `candidates/${folderName}/uploads/.keep`,
            Body: ""
        }));

        await recordActivity({
            type: 'invite',
            actor: body.recruiter || 'unknown-recruiter',
            message: `Invite generated for ${name} <${email}> as ${role}.`,
            meta: { folderName, inviteId, role }
        });

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ success: true, inviteId, folderName })
        };
    } catch (e) {
        console.error("Invite generation failed:", e);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: "Internal Server Error" })
        };
    }
};
