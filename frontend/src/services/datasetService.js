function getApiBaseUrl() {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

export async function downloadDataset(payload) {
  const apiBase = getApiBaseUrl();
  const response = await fetch(`${apiBase}/api/dataset/download`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const backendMessage = body?.detail?.message || body?.message || `Request failed with status ${response.status}`;
    throw new Error(backendMessage);
  }

  return body;
}
