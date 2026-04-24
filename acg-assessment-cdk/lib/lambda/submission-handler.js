const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { TextractClient, DetectDocumentTextCommand } = require('@aws-sdk/client-textract');

const s3 = new S3Client({});
const ses = new SESClient({});
const textract = new TextractClient({});

exports.handler = async (event) => {
    try {
        const body = JSON.parse(event.body || "{}");

        if (!body.candidate || !body.candidate.email || !body.candidate.name) {
            return {
                statusCode: 400,
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ error: "Missing candidate email or name" })
            };
        }

        const submittedAtUtc = new Date().toISOString();
        const email = body.candidate.email;
        const uploadKeys = body.uploadKeys || [];
        const folderName = body.folderName;

        if (!folderName) {
            return {
                statusCode: 400,
                headers: { "Access-Control-Allow-Origin": "*" },
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

        // --- 2. Perplexity `sonar-pro` API Evaluation ---
        let simulatedPerplexityEvaluation = {
            status: "evaluating",
            note: "Perplexity AI analysis pipeline skipped. Key missing.",
            suggestedScore: "Pending"
        };

        if (process.env.PERPLEXITY_API_KEY) {
            const prompt = `
You are an expert technical recruiter and AI grader evaluating a candidate's pre-hire assessment.
Candidate Role: ${body.candidate.role}
Candidate Name: ${body.candidate.name}

Here are the candidate's answers to the assessment tasks:
${JSON.stringify(body.completedSteps || {}, null, 2)}

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
                const apiRes = await fetch("https://api.perplexity.ai/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: "sonar-pro",
                        messages: [
                            { role: "system", content: "You are a JSON-only API. You output raw valid JSON without markdown wrapping." },
                            { role: "user", content: prompt }
                        ]
                    })
                });
                
                if (apiRes.ok) {
                    const data = await apiRes.json();
                    let content = data.choices[0].message.content;
                    content = content.replace(/```json/g, '').replace(/```/g, '').trim();
                    const parsed = JSON.parse(content);
                    simulatedPerplexityEvaluation = {
                        status: "completed",
                        note: parsed.note || "Evaluated by Perplexity Sonar-Pro.",
                        suggestedScore: parsed.suggestedScore || "Yellow"
                    };
                } else {
                    console.error("Perplexity API error", await apiRes.text());
                    simulatedPerplexityEvaluation.note = "Perplexity API returned an error.";
                }
            } catch (err) {
                console.error("Failed to call Perplexity", err);
                simulatedPerplexityEvaluation.note = "Failed to reach Perplexity API or parse response.";
            }
        }

        const finalData = {
            metadata: {
                version: "2.0.0",
                submittedAtUtc,
                assessmentStartUtc: body.assessmentStartUtc || submittedAtUtc,
            },
            candidate: body.candidate,
            tasks: body.completedSteps || {},
            notes: body.issueNotes || "",
            uploads: uploadKeys,
            perplexityAnalysis: simulatedPerplexityEvaluation,
            analyticsLog: body.analyticsLog || {}
        };

        const recordKey = `candidates/${folderName}/assessment_results/final_submission.json`;

        await s3.send(new PutObjectCommand({
            Bucket: process.env.CANDIDATE_RECORDS_BUCKET,
            Key: recordKey,
            Body: JSON.stringify(finalData, null, 2),
            ContentType: "application/json"
        }));

        const htmlBody = `
            <h2>New Assessment Submission</h2>
            <p><strong>Candidate:</strong> ${body.candidate.name} (${email})</p>
            <p><strong>Role:</strong> ${body.candidate.role || 'Agent'}</p>
            <p><strong>IP Address:</strong> ${event.requestContext?.identity?.sourceIp || 'Unknown'}</p>
            <h3>Session Analytics</h3>
            <pre>${JSON.stringify(body.analyticsLog || {}, null, 2)}</pre>
            <h3>Notes</h3>
            <p>${body.issueNotes || 'None'}</p>
            <p><a href="https://d2bw7m35kiyslf.cloudfront.net/?admin=true">View full results in dashboard</a></p>
        `;

        try {
            await ses.send(new SendEmailCommand({
                Source: "esylvia@audleyconsultinggroup-gs.com",
                Destination: {
                    ToAddresses: ["esylvia@audleyconsultinggroup-gs.com"]
                },
                Message: {
                    Subject: { Data: `Assessment Completed: ${body.candidate.name}` },
                    Body: { Html: { Data: htmlBody } }
                }
            }));
            console.log("Email sent successfully.");
        } catch (emailError) {
            console.error("Failed to send email via SES:", emailError);
        }

        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ success: true, recordKey })
        };
    } catch (e) {
        console.error("Submission processing failed:", e);
        return {
            statusCode: 500,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: "Internal Server Error" })
        };
    }
};
