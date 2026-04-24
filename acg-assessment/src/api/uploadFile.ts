export const uploadFile = async (file: File, folderName: string) => {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (!apiUrl) throw new Error("VITE_API_URL missing");

  const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
  
  // 1. Get presigned URL
  const presignRes = await fetch(`${baseUrl}/uploads/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      folderName,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream'
    })
  });

  if (!presignRes.ok) throw new Error("Failed to get presigned URL");
  const presignData = await presignRes.json();

  // 2. Upload to S3 using PUT
  const uploadRes = await fetch(presignData.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file
  });

  if (!uploadRes.ok) throw new Error("Failed to upload file to S3");

  return presignData.fileKey; // The S3 Key we need to pass to the submission
};
