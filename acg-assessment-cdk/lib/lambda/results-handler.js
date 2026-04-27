const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({});

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
        const bucket = process.env.CANDIDATE_RECORDS_BUCKET;
        const listCommand = new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: 'candidates/'
        });
        const listResponse = await s3.send(listCommand);

        const submissions = [];
        if (listResponse.Contents) {
            for (const item of listResponse.Contents) {
                if (!item.Key.endsWith('/assessment_results/final_submission.json')) continue;

                const getCommand = new GetObjectCommand({
                    Bucket: bucket,
                    Key: item.Key
                });
                const getResponse = await s3.send(getCommand);
                const bodyStr = await getResponse.Body.transformToString();

                try {
                    const data = JSON.parse(bodyStr);

                    const uploadLinks = [];
                    if (data.uploads && Array.isArray(data.uploads)) {
                        for (const uKey of data.uploads) {
                            const uCmd = new GetObjectCommand({
                                Bucket: bucket,
                                Key: uKey
                            });
                            const url = await getSignedUrl(s3, uCmd, { expiresIn: 3600 });
                            const filename = uKey.split('/').pop();
                            uploadLinks.push({ filename, url });
                        }
                    }

                    const ai = data.aiAnalysis || data.perplexityAnalysis || {};
                    submissions.push({
                        id: item.Key,
                        name: data.candidate?.name || "Unknown Candidate",
                        email: data.candidate?.email || "No Email",
                        role: data.candidate?.role || "Candidate",
                        status: "Completed",
                        score: ai.suggestedScore || "Pending",
                        submitted: data.metadata?.submittedAtUtc || new Date().toISOString(),
                        notes: ai.note || data.notes || "",
                        aiStatus: ai.status || null,
                        aiErrorClass: ai.errorClass || null,
                        analytics: data.analyticsLog || null,
                        uploadLinks: uploadLinks,
                        stepUploads: data.stepUploads || {}
                    });
                } catch (parseError) {
                    console.error("Failed to parse submission JSON for key:", item.Key);
                }
            }
        }

        submissions.sort((a, b) => new Date(b.submitted).getTime() - new Date(a.submitted).getTime());

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify(submissions)
        };
    } catch (e) {
        console.error("Failed to fetch results:", e);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: "Internal Server Error" })
        };
    }
};
