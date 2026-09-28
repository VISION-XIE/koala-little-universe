const local = ['localhost', '127.0.0.1'].includes(location.hostname);
export const apiOrigin = local ? 'http://127.0.0.1:8787' : 'https://koalasissy.cn';

async function request(path, { method = 'GET', token = '', body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${apiOrigin}${path}`, {
      method,
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `云端请求失败（${response.status}）。`);
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('云端连接超时，请稍后重试。');
    if (error instanceof TypeError) throw new Error('暂时无法连接云端，请检查网络后重试。');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const fetchCloudRecords = () => request('/api/records');
export const checkAdmin = token => request('/api/admin/check', { method: 'POST', token });
export const saveCloudRecords = (records, expectedRevision, token) =>
  request('/api/records', { method: 'PUT', token, body: { records, expectedRevision } });
