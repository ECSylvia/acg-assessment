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
            suggestedScore: "Pending",
            errorClass: null,
            errorDetail: null,
            modelId: null
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

        // Claude 3.5 Haiku in us-east-1 must be invoked through the cross-region
        // inference profile. Direct foundation-model invocation returns
        // ValidationException ("on-demand throughput isn't supported"). Allow
        // override via env in case the account is configured differently.
        const primaryModelId = process.env.BEDROCK_MODEL_ID
            || "us.anthropic.claude-3-5-haiku-20241022-v1:0";
        const fallbackModelId = "anthropic.claude-3-5-haiku-20241022-v1:0";

        const classifyBedrockError = (err) => {
            const name = err && (err.name || err.Code || err.code) || "";
            const msg = (err && (err.message || String(err))) || "";
            if (/AccessDenied/i.test(name) || /not authorized/i.test(msg) || /access.*denied/i.test(msg)) {
                return "AccessDeniedException";
            }
            if (/ResourceNotFound/i.test(name) || /not found/i.test(msg)) {
                return "ResourceNotFoundException";
            }
            if (/Validation/i.test(name) || /on-demand throughput/i.test(msg) || /inference profile/i.test(msg)) {
                return "ValidationException";
            }
            if (/Throttling/i.test(name) || /TooManyRequests/i.test(name) || /rate exceed/i.test(msg)) {
                return "ThrottlingException";
            }
            if (/Timeout/i.test(name) || /timed? ?out/i.test(msg) || /ETIMEDOUT/i.test(msg)) {
                return "TimeoutException";
            }
            if (/ModelError/i.test(name) || /Model.*not.*ready/i.test(msg)) {
                return "ModelError";
            }
            return name || "UnknownError";
        };

        const tryInvoke = async (modelId) => {
            const command = new InvokeModelCommand({
                modelId,
                contentType: "application/json",
                accept: "application/json",
                body: JSON.stringify({
                    anthropic_version: "bedrock-2023-05-31",
                    max_tokens: 1000,
                    system: "You are a JSON-only API. You output raw valid JSON without markdown wrapping.",
                    messages: [
                        { role: "user", content: [{ type: "text", text: prompt }] }
                    ]
                })
            });
            const response = await bedrock.send(command);
            // response.body is a Uint8Array in Node 20 SDK v3
            let rawRes;
            if (response.body && typeof response.body.transformToString === 'function') {
                rawRes = await response.body.transformToString();
            } else {
                rawRes = new TextDecoder().decode(response.body);
            }
            return rawRes;
        };

        const parseModelResponse = (rawRes) => {
            const data = JSON.parse(rawRes);
            // Bedrock Messages API: { content: [{ type: 'text', text: '...' }], ... }
            let text = "";
            if (Array.isArray(data.content)) {
                text = data.content
                    .filter(c => c && (c.type === 'text' || typeof c.text === 'string'))
                    .map(c => c.text || '')
                    .join('\n')
                    .trim();
            } else if (typeof data.completion === 'string') {
                // Legacy Anthropic Text Completions shape
                text = data.completion.trim();
            } else if (typeof data.output_text === 'string') {
                text = data.output_text.trim();
            }
            if (!text) {
                throw new Error('Bedrock response had no text content');
            }
            // Strip code fences and any leading/trailing prose
            let cleaned = text.replace(/```(?:json)?/gi, '').trim();
            // Extract first {...} JSON object if model added prose around it
            const objMatch = cleaned.match(/\{[\s\S]*\}/);
            if (objMatch) cleaned = objMatch[0];
            const parsed = JSON.parse(cleaned);
            const score = String(parsed.suggestedScore || 'Yellow').trim();
            const normalized = /^green$/i.test(score) ? 'Green'
                : /^red$/i.test(score) ? 'Red'
                : 'Yellow';
            return {
                suggestedScore: normalized,
                note: parsed.note || "Evaluated by Amazon Bedrock (Claude 3.5 Haiku)."
            };
        };

        const modelsToTry = [primaryModelId];
        if (primaryModelId !== fallbackModelId) modelsToTry.push(fallbackModelId);

        let lastError = null;
        for (const modelId of modelsToTry) {
            try {
                console.log(`Invoking Bedrock model: ${modelId}`);
                const rawRes = await tryInvoke(modelId);
                try {
                    const parsed = parseModelResponse(rawRes);
                    aiEvaluation = {
                        status: "completed",
                        note: parsed.note,
                        suggestedScore: parsed.suggestedScore,
                        errorClass: null,
                        errorDetail: null,
                        modelId
                    };
                    lastError = null;
                    break;
                } catch (parseErr) {
                    console.error(`Bedrock response parse failed for ${modelId}: ${parseErr.message}`);
                    console.error(`Raw response (truncated 1KB): ${String(rawRes).slice(0, 1024)}`);
                    aiEvaluation = {
                        status: "parse_failed",
                        note: "Bedrock returned a response but it could not be parsed. A reviewer will assign a score manually.",
                        suggestedScore: "Pending",
                        errorClass: "ParseError",
                        errorDetail: parseErr.message,
                        modelId
                    };
                    lastError = parseErr;
                    break; // Don't retry parse failures with the fallback model
                }
            } catch (err) {
                lastError = err;
                const cls = classifyBedrockError(err);
                console.error(`Bedrock invoke failed (${modelId}) [${cls}]: ${err.name || ''} ${err.message || err}`);
                // Retry on ValidationException with fallback (covers swapped profile/foundation IDs)
                if (cls === "ValidationException" && modelId !== modelsToTry[modelsToTry.length - 1]) {
                    continue;
                }
                aiEvaluation = {
                    status: "failed",
                    note: cls === "AccessDeniedException"
                        ? "Bedrock access denied. The Lambda role lacks permission for this model, or model access has not been granted in the Bedrock console for this region."
                        : cls === "ResourceNotFoundException"
                            ? "Bedrock model not found in this region. Verify the model ID and that the model is enabled for the deployment region."
                            : cls === "ValidationException"
                                ? "Bedrock rejected the request payload or model ID (likely needs an inference profile)."
                                : cls === "ThrottlingException"
                                    ? "Bedrock throttled the request. A reviewer will retry or assign a score manually."
                                    : cls === "TimeoutException"
                                        ? "Bedrock request timed out. The Lambda timeout may need to be increased."
                                        : "Failed to reach Amazon Bedrock API or parse response.",
                    suggestedScore: "Pending",
                    errorClass: cls,
                    errorDetail: (err && err.message) ? String(err.message).slice(0, 500) : null,
                    modelId
                };
                break;
            }
        }
        if (lastError && aiEvaluation.status === "evaluating") {
            aiEvaluation = {
                status: "failed",
                note: "Failed to reach Amazon Bedrock API or parse response.",
                suggestedScore: "Pending",
                errorClass: classifyBedrockError(lastError),
                errorDetail: (lastError && lastError.message) ? String(lastError.message).slice(0, 500) : null,
                modelId: modelsToTry[modelsToTry.length - 1]
            };
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
