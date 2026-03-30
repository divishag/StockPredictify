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

export async function getTrackedSymbols() {
  const apiBase = getApiBaseUrl();
  const response = await fetch(`${apiBase}/api/dataset/tracked`);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const backendMessage = body?.detail?.message || body?.message || `Request failed with status ${response.status}`;
    throw new Error(backendMessage);
  }

  return body;
}

export async function getTrackedSymbolDetails(symbol) {
  const apiBase = getApiBaseUrl();
  const response = await fetch(`${apiBase}/api/dataset/tracked/${encodeURIComponent(symbol)}`);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const backendMessage = body?.detail?.message || body?.message || `Request failed with status ${response.status}`;
    throw new Error(backendMessage);
  }

  return body;
}

export async function getTrackedSymbolPreview(symbol) {
  const apiBase = getApiBaseUrl();
  const response = await fetch(`${apiBase}/api/dataset/tracked/${encodeURIComponent(symbol)}/preview`);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const backendMessage = body?.detail?.message || body?.message || `Request failed with status ${response.status}`;
    throw new Error(backendMessage);
  }

  return body;
}

export async function deleteTrackedSymbol(symbol) {
  const apiBase = getApiBaseUrl();
  const response = await fetch(`${apiBase}/api/dataset/tracked/${encodeURIComponent(symbol)}`, {
    method: "DELETE",
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const backendMessage = body?.detail?.message || body?.message || `Request failed with status ${response.status}`;
    throw new Error(backendMessage);
  }

  return body;
}

export async function getTrainableStocks() {
  const apiBase = getApiBaseUrl();
  const response = await fetch(`${apiBase}/api/dataset/training/stocks`);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const backendMessage = body?.detail?.message || body?.message || `Request failed with status ${response.status}`;
    throw new Error(backendMessage);
  }

  return body;
}

export async function trainSelectedStock(symbol, params = {}) {
  const apiBase = getApiBaseUrl();
  const response = await fetch(`${apiBase}/api/dataset/training/train`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ symbol, ...params }),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const backendMessage = body?.detail?.message || body?.message || `Request failed with status ${response.status}`;
    throw new Error(backendMessage);
  }

  return body;
}
