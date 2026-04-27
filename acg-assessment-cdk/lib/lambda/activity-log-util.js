const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');

const s3 = new S3Client({});

async function recordActivity(entry) {
    const bucket = process.env.CANDIDATE_RECORDS_BUCKET;
    if (!bucket) return;
    try {
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
    } catch (err) {
        console.error('Failed to record activity log entry', err);
    }
}

module.exports = { recordActivity };
