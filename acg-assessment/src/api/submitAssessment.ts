export const submitAssessment = async (payload: any) => {
  console.log("Submitting assessment payload to backend:", payload);
  
  const apiUrl = import.meta.env.VITE_API_URL;
  
  if (!apiUrl) {
    console.warn("VITE_API_URL is missing. Using local mock submit.");
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: true, timestamp: new Date().toISOString() });
      }, 1500);
    });
  }

  try {
    const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
    const response = await fetch(`${baseUrl}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const data = await response.json();
    return { success: true, timestamp: new Date().toISOString(), ...data };
  } catch (error) {
    console.error("Failed to submit assessment to API:", error);
    throw error;
  }
};
