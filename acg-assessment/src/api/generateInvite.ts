import { adminFetch, apiBase } from './adminClient';

export const generateInvite = async (payload: { candidateName: string, candidateEmail: string, role: string, recruiter?: string }) => {
  const apiUrl = import.meta.env.VITE_API_URL;

  if (!apiUrl) {
    return new Promise<{ success: boolean, inviteId: string, link: string }>((resolve) => {
      setTimeout(() => {
        const inviteId = Math.random().toString(36).substring(2, 10);
        const host = window.location.origin;
        const link = `${host}/?invite=${inviteId}&name=${encodeURIComponent(payload.candidateName)}&email=${encodeURIComponent(payload.candidateEmail)}`;
        resolve({ success: true, inviteId, link });
      }, 500);
    });
  }

  try {
    const response = await adminFetch(`/invites`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      throw new Error('Unauthorized — please log in again.');
    }
    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const data = await response.json();
    const host = window.location.origin;
    const link = `${host}/?invite=${data.inviteId}&name=${encodeURIComponent(payload.candidateName)}&email=${encodeURIComponent(payload.candidateEmail)}&folder=${encodeURIComponent(data.folderName)}`;

    return { success: true, inviteId: data.inviteId, link, _api: apiBase() };
  } catch (error) {
    console.error('Failed to generate invite:', error);
    throw error;
  }
};
