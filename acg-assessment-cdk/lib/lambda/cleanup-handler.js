const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({});

exports.handler = async (event) => {
    try {
        const bucket = process.env.CANDIDATE_RECORDS_BUCKET;
        console.log(`Starting cleanup on bucket: ${bucket}`);

        // List all invites to find active candidate folders
        const listCommand = new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: 'candidates/'
        });
        
        const listResponse = await s3.send(listCommand);
        if (!listResponse.Contents) {
            console.log("No candidates found.");
            return { statusCode: 200 };
        }

        const candidateFolders = new Set();
        for (const item of listResponse.Contents) {
            const match = item.Key.match(/^candidates\/([^\/]+)\/invite\.json$/);
            if (match) {
                candidateFolders.add({ folderName: match[1], lastModified: item.LastModified });
            }
        }

        const now = new Date();
        const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

        for (const candidate of candidateFolders) {
            const ageMs = now.getTime() - new Date(candidate.lastModified).getTime();
            
            if (ageMs > FORTY_EIGHT_HOURS_MS) {
                console.log(`Candidate ${candidate.folderName} is older than 48 hours.`);

                // Check if final_submission.json exists
                const checkSubmissionCommand = new ListObjectsV2Command({
                    Bucket: bucket,
                    Prefix: `candidates/${candidate.folderName}/assessment_results/final_submission.json`
                });
                const submissionResponse = await s3.send(checkSubmissionCommand);

                if (!submissionResponse.Contents || submissionResponse.Contents.length === 0) {
                    console.log(`No final submission found for ${candidate.folderName}. Deleting folder...`);
                    
                    // List all objects in this candidate's prefix to delete
                    const objectsToDelete = [];
                    const listAllCommand = new ListObjectsV2Command({
                        Bucket: bucket,
                        Prefix: `candidates/${candidate.folderName}/`
                    });
                    const allResponse = await s3.send(listAllCommand);
                    
                    if (allResponse.Contents) {
                        for (const obj of allResponse.Contents) {
                            objectsToDelete.push({ Key: obj.Key });
                        }
                    }

                    if (objectsToDelete.length > 0) {
                        await s3.send(new DeleteObjectsCommand({
                            Bucket: bucket,
                            Delete: {
                                Objects: objectsToDelete,
                                Quiet: false
                            }
                        }));
                        console.log(`Deleted ${objectsToDelete.length} objects for ${candidate.folderName}`);
                    }
                } else {
                    console.log(`Candidate ${candidate.folderName} has a final submission. Preserving folder.`);
                }
            }
        }

        return { statusCode: 200, body: "Cleanup successful" };
    } catch (e) {
        console.error("Cleanup failed:", e);
        return { statusCode: 500, body: "Cleanup failed" };
    }
};
