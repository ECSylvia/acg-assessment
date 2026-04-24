const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({});

exports.handler = async (event) => {
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
                    
                    // Generate presigned URLs for all uploads
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

                    // Map the S3 data to the structure the frontend expects
                    submissions.push({
                        id: item.Key,
                        name: data.candidate?.name || "Unknown Candidate",
                        email: data.candidate?.email || "No Email",
                        role: data.candidate?.role || "Candidate",
                        status: "Completed",
                        score: data.perplexityAnalysis?.suggestedScore || data.perpelxityAnalysis?.suggestedScore || "Pending",
                        submitted: data.metadata?.submittedAtUtc || new Date().toISOString(),
                        notes: data.perplexityAnalysis?.note || data.perpelxityAnalysis?.note || data.notes || "",
                        analytics: data.analyticsLog || null,
                        uploadLinks: uploadLinks
                    });
                } catch (parseError) {
                    console.error("Failed to parse submission JSON for key:", item.Key);
                }
            }
        }

        // Sort by submission date (newest first)
        submissions.sort((a, b) => new Date(b.submitted).getTime() - new Date(a.submitted).getTime());

        return {
            statusCode: 200,
            headers: { 
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            body: JSON.stringify(submissions)
        };
    } catch (e) {
        console.error("Failed to fetch results:", e);
        return {
            statusCode: 500,
            headers: { 
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            body: JSON.stringify({ error: "Internal Server Error" })
        };
    }
};
