const { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');

const s3 = new S3Client({});

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const baseHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
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

async function listLogs(bucket) {
    const list = await s3.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: 'activity-log/'
    }));
    if (!list.Contents) return [];
    const sorted = list.Contents
        .filter(o => o.Key.endsWith('.json'))
        .sort((a, b) => new Date(b.LastModified).getTime() - new Date(a.LastModified).getTime())
        .slice(0, 500);

    const out = [];
    for (const obj of sorted) {
        try {
            const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: obj.Key }));
            const body = await res.Body.transformToString();
            out.push(JSON.parse(body));
        } catch (err) {
            console.error('Failed to read log entry', obj.Key, err);
        }
    }
    return out;
}

async function writeLog(bucket, entry) {
    const id = crypto.randomBytes(6).toString('hex');
    const timestamp = new Date().toISOString();
    const record = {
        id,
        timestamp,
        type: entry.type || 'info',
        actor: entry.actor || 'system',
        message: entry.message || '',
        meta: entry.meta || {}
    };
    const key = `activity-log/${timestamp.replace(/[:.]/g, '-')}_${id}.json`;
    await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify(record, null, 2),
        ContentType: 'application/json'
    }));
    return record;
}

exports.writeLog = writeLog;

exports.handler = async (event) => {
    const method = (event.httpMethod || event.requestContext?.http?.method || '').toUpperCase();

    if (method === 'OPTIONS') {
        return { statusCode: 204, headers: baseHeaders, body: '' };
    }

    const auth = requireAdminAuth(event);
    if (!auth.ok) {
        return { statusCode: 401, headers: baseHeaders, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const bucket = process.env.CANDIDATE_RECORDS_BUCKET;

    try {
        if (method === 'GET') {
            const entries = await listLogs(bucket);
            return { statusCode: 200, headers: baseHeaders, body: JSON.stringify(entries) };
        }
        if (method === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const record = await writeLog(bucket, body);
            return { statusCode: 200, headers: baseHeaders, body: JSON.stringify(record) };
        }
        return { statusCode: 405, headers: baseHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (e) {
        console.error('Activity log handler failed', e);
        return { statusCode: 500, headers: baseHeaders, body: JSON.stringify({ error: 'Internal error' }) };
    }
};
