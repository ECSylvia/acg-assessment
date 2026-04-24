export const generateInvite = async (payload: { candidateName: string, candidateEmail: string, role: string }) => {
  console.log("Generating tracking invite for:", payload);
  
  const apiUrl = import.meta.env.VITE_API_URL;
  
  if (!apiUrl) {
    console.warn("VITE_API_URL is missing. Using local mock generator.");
    return new Promise<{ success: boolean, inviteId: string, link: string }>((resolve) => {
      setTimeout(() => {
        const inviteId = Math.random().toString(36).substring(2, 10);
        const host = window.location.origin;
        const link = `${host}/?invite=${inviteId}&name=${encodeURIComponent(payload.candidateName)}&email=${encodeURIComponent(payload.candidateEmail)}`;
        resolve({ success: true, inviteId, link });
      }, 800);
    });
  }

  try {
    // Remove trailing slash if present, then append /invites
    const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
    const response = await fetch(`${baseUrl}/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const data = await response.json();
    const host = window.location.origin;
    const link = `${host}/?invite=${data.inviteId}&name=${encodeURIComponent(payload.candidateName)}&email=${encodeURIComponent(payload.candidateEmail)}`;
    
    return { success: true, inviteId: data.inviteId, link };
  } catch (error) {
    console.error("Failed to generate invite from API:", error);
    throw error;
  }
};
