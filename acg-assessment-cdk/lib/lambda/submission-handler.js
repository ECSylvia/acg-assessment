const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { TextractClient, DetectDocumentTextCommand } = require('@aws-sdk/client-textract');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { recordActivity } = require('./activity-log-util');

const s3 = new S3Client({});
const textract = new TextractClient({});
const bedrock = new BedrockRuntimeClient({});

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

exports.handler = async (event) => {
    try {
        const body = JSON.parse(event.body || "{}");

        if (!body.candidate || !body.candidate.email || !body.candidate.name) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: "Missing candidate email or name" })
            };
        }

        const submittedAtUtc = new Date().toISOString();
        const email = body.candidate.email;
        const uploadKeys = body.uploadKeys || [];
        const folderName = body.folderName;
        const stepUploads = body.stepUploads || {};

        if (!folderName) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: "Missing folderName in submission" })
            };
        }

        console.log(`Received assessment from ${email}. Uploads bounded: ${uploadKeys.length}`);

        // --- 1. Textract & S3 File Extraction Pipeline ---
        let extractedTextFromUploads = "";

        for (const key of uploadKeys) {
            if (key.match(/\.(jpeg|jpg|png)$/i)) {
                try {
                    const response = await textract.send(new DetectDocumentTextCommand({
                        Document: { S3Object: { Bucket: process.env.CANDIDATE_RECORDS_BUCKET, Name: key } }
                    }));
                    extractedTextFromUploads += `\n--- OCR of ${key} ---\n`;
                    if (response.Blocks) {
                        response.Blocks.forEach(b => {
                            if (b.BlockType === 'LINE') extractedTextFromUploads += b.Text + "\n";
                        });
                    }
                } catch (err) {
                    console.error(`Textract failed for ${key}`, err);
                }
            } else if (key.match(/\.(txt|md|csv|json)$/i)) {
                try {
                    const getRes = await s3.send(new GetObjectCommand({
                        Bucket: process.env.CANDIDATE_RECORDS_BUCKET, Key: key
                    }));
                    const text = await getRes.Body.transformToString();
                    extractedTextFromUploads += `\n--- Content of ${key} ---\n${text}\n`;
                } catch (err) {
                    console.error(`S3 get failed for ${key}`, err);
                }
            }
        }

        // --- 2. Amazon Bedrock Claude 3.5 Haiku API Evaluation ---
        let aiEvaluation = {
            status: "evaluating",
            note: "AI analysis pipeline skipped. AWS Bedrock failure.",
            suggestedScore: "Pending"
        };

        const prompt = `
You are an expert technical recruiter and AI grader evaluating a candidate's pre-hire assessment.
Candidate Role: ${body.candidate.role}
Candidate Name: ${body.candidate.name}

Here are the candidate's answers to the assessment tasks:
${JSON.stringify(body.completedSteps || {}, null, 2)}

Per-step uploaded evidence (filenames per step):
${JSON.stringify(stepUploads || {}, null, 2)}

Here is the extracted text from the files/screenshots they uploaded as proof:
${extractedTextFromUploads}

Please evaluate this candidate based on standard technical recruiter guidelines.
Determine a final score: "Green" (Pass), "Yellow" (Pass with reservations), or "Red" (Fail).
You must output a JSON object exactly like this:
{
  "suggestedScore": "Green|Yellow|Red",
  "note": "A 2-3 sentence justification for the score based on their answers and proof."
}
Do not include any markdown formatting like \`\`\`json in your response, just the raw JSON object.
`;

        try {
            const command = new InvokeModelCommand({
                modelId: "anthropic.claude-3-5-haiku-20241022-v1:0",
                contentType: "application/json",
                accept: "application/json",
                body: JSON.stringify({
                    anthropic_version: "bedrock-2023-05-31",
                    max_tokens: 1000,
                    system: "You are a JSON-only API. You output raw valid JSON without markdown wrapping.",
                    messages: [
                        { role: "user", content: prompt }
                    ]
                })
            });

            const response = await bedrock.send(command);
            const rawRes = new TextDecoder().decode(response.body);
            const data = JSON.parse(rawRes);

            let content = data.content[0].text;
            content = content.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(content);
            aiEvaluation = {
                status: "completed",
                note: parsed.note || "Evaluated by Amazon Bedrock (Claude 3.5 Haiku).",
                suggestedScore: parsed.suggestedScore || "Yellow"
            };
        } catch (err) {
            console.error("Failed to call Amazon Bedrock", err);
            aiEvaluation.note = "Failed to reach Amazon Bedrock API or parse response.";
        }

        const finalData = {
            metadata: {
                version: "2.1.0",
                submittedAtUtc,
                assessmentStartUtc: body.assessmentStartUtc || submittedAtUtc,
                sourceIp: event.requestContext?.identity?.sourceIp || null
            },
            candidate: body.candidate,
            tasks: body.completedSteps || {},
            notes: body.issueNotes || "",
            uploads: uploadKeys,
            stepUploads,
            // Backwards-compatible field name (results-handler still reads perplexityAnalysis)
            perplexityAnalysis: aiEvaluation,
            aiAnalysis: aiEvaluation,
            analyticsLog: body.analyticsLog || {}
        };

        const recordKey = `candidates/${folderName}/assessment_results/final_submission.json`;

        await s3.send(new PutObjectCommand({
            Bucket: process.env.CANDIDATE_RECORDS_BUCKET,
            Key: recordKey,
            Body: JSON.stringify(finalData, null, 2),
            ContentType: "application/json"
        }));

        // Replace SES notification with in-app activity log entry.
        await recordActivity({
            type: 'submission',
            actor: `${body.candidate.name} <${email}>`,
            message: `Assessment submitted by ${body.candidate.name} (${body.candidate.role || 'Agent'}). AI score: ${aiEvaluation.suggestedScore}.`,
            meta: {
                folderName,
                role: body.candidate.role || 'Agent',
                score: aiEvaluation.suggestedScore,
                uploadCount: uploadKeys.length,
                sourceIp: event.requestContext?.identity?.sourceIp || null,
                recordKey
            }
        });

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ success: true, recordKey })
        };
    } catch (e) {
        console.error("Submission processing failed:", e);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: "Internal Server Error" })
        };
    }
};
