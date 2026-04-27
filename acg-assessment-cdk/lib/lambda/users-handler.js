const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const { recordActivity } = require('./activity-log-util');

const s3 = new S3Client({});

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const baseHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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

function safeId(email) {
    return email.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

async function listUsers(bucket) {
    const list = await s3.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: 'users/'
    }));
    if (!list.Contents) return [];
    const users = [];
    for (const item of list.Contents) {
        if (!item.Key.endsWith('.json')) continue;
        try {
            const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: item.Key }));
            const body = await res.Body.transformToString();
            users.push(JSON.parse(body));
        } catch (err) {
            console.error('Failed to read user', item.Key, err);
        }
    }
    return users;
}

async function createUser(bucket, payload, actor) {
    if (!payload.email || !payload.name) {
        const err = new Error('email and name are required');
        err.statusCode = 400;
        throw err;
    }
    const role = payload.role || 'recruiter';
    const id = safeId(payload.email);
    const accessToken = crypto.randomBytes(24).toString('hex');
    const record = {
        id,
        name: payload.name,
        email: payload.email,
        role,
        accessToken,
        createdAtUtc: new Date().toISOString(),
        createdBy: actor || 'admin'
    };
    await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: `users/${id}.json`,
        Body: JSON.stringify(record, null, 2),
        ContentType: 'application/json'
    }));
    await recordActivity({
        type: 'user',
        actor: actor || 'admin',
        message: `Recruiter ${record.name} <${record.email}> added with role ${role}.`,
        meta: { id, role }
    });
    return record;
}

async function deleteUser(bucket, id, actor) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: `users/${id}.json` }));
    await recordActivity({
        type: 'user',
        actor: actor || 'admin',
        message: `Recruiter ${id} removed.`,
        meta: { id }
    });
}

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
            const users = await listUsers(bucket);
            // Strip access tokens from list response
            const sanitized = users.map(u => ({
                id: u.id,
                name: u.name,
                email: u.email,
                role: u.role,
                createdAtUtc: u.createdAtUtc,
                createdBy: u.createdBy
            }));
            return { statusCode: 200, headers: baseHeaders, body: JSON.stringify(sanitized) };
        }
        if (method === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const actor = (event.headers?.['x-actor'] || event.headers?.['X-Actor'] || 'admin');
            const created = await createUser(bucket, body, actor);
            // Return the access token only at creation time so it can be shared with the recruiter once.
            return { statusCode: 200, headers: baseHeaders, body: JSON.stringify(created) };
        }
        if (method === 'DELETE') {
            const id = (event.pathParameters && event.pathParameters.id) || (event.queryStringParameters && event.queryStringParameters.id);
            if (!id) {
                return { statusCode: 400, headers: baseHeaders, body: JSON.stringify({ error: 'Missing id' }) };
            }
            const actor = (event.headers?.['x-actor'] || event.headers?.['X-Actor'] || 'admin');
            await deleteUser(bucket, id, actor);
            return { statusCode: 200, headers: baseHeaders, body: JSON.stringify({ success: true }) };
        }
        return { statusCode: 405, headers: baseHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (e) {
        const status = e.statusCode || 500;
        console.error('Users handler failed', e);
        return { statusCode: status, headers: baseHeaders, body: JSON.stringify({ error: e.message || 'Internal error' }) };
    }
};
