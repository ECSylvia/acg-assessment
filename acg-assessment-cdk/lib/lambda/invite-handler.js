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
        const name = body.candidateName || "Unknown";
        const role = body.role || 'Agent';
        const inviteId = crypto.randomBytes(4).toString('hex');

        // Generate safe folder name: FirstName_LastName_InviteId
        const safeName = name.replace(/[^a-zA-Z0-9]/g, '_');
        const folderName = `${safeName}_${inviteId}`;

        // Log the invite out to S3 candidate folder
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
                generatedAtUtc: new Date().toISOString()
            }, null, 2),
            ContentType: "application/json"
        }));

        // Put placeholder to create uploads directory
        await s3.send(new PutObjectCommand({
            Bucket: process.env.CANDIDATE_RECORDS_BUCKET,
            Key: `candidates/${folderName}/uploads/.keep`,
            Body: ""
        }));

        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ success: true, inviteId, folderName })
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
