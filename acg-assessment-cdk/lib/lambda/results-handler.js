const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({});

exports.handler = async (event) => {
    try {
        const listCommand = new ListObjectsV2Command({
            Bucket: process.env.DATA_BUCKET,
            Prefix: 'submissions/'
        });
        const listResponse = await s3.send(listCommand);

        const submissions = [];
        if (listResponse.Contents) {
            for (const item of listResponse.Contents) {
                if (!item.Key.endsWith('.json')) continue;
                
                const getCommand = new GetObjectCommand({
                    Bucket: process.env.DATA_BUCKET,
                    Key: item.Key
                });
                const getResponse = await s3.send(getCommand);
                const bodyStr = await getResponse.Body.transformToString();
                
                try {
                    const data = JSON.parse(bodyStr);
                    
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
                        analytics: data.analyticsLog || null
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
