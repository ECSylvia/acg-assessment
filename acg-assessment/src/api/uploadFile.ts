export const uploadFile = async (file: File, folderName: string, stepId?: string) => {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (!apiUrl) throw new Error("VITE_API_URL missing");

  const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;

  const presignRes = await fetch(`${baseUrl}/uploads/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      folderName,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      stepId
    })
  });

  if (!presignRes.ok) throw new Error("Failed to get presigned URL");
  const presignData = await presignRes.json();

  if (presignData.maxBytes && file.size > presignData.maxBytes) {
    throw new Error(`File too large. Max ${(presignData.maxBytes / 1024 / 1024).toFixed(0)} MB.`);
  }

  const uploadRes = await fetch(presignData.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file
  });

  if (!uploadRes.ok) throw new Error("Failed to upload file to S3");

  return presignData.fileKey as string;
};
