'use strict';

// Only the public Supabase project key belongs in browser code.
const CLOUD_URL = 'https://ikbbecvdjwuzbmbpmuko.supabase.co';
const CLOUD_KEY = 'sb_publishable_chA1a3raw2ONz-0B2hfjtg_PKQzAXO2';
const SESSION_KEY = 'nihongo-n4-session-v1';

class NihongoCloud {
  constructor() {
    this.session = null;
    this.refreshing = null;
    try {
      const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (saved?.user?.id && saved.access_token && saved.refresh_token) this.session = saved;
    } catch { /* Continue as a guest if storage is unavailable. */ }
  }

  get user() { return this.session?.user || null; }

  storeSession(session) {
    if (!session?.user?.id || !session.access_token || !session.refresh_token) throw new Error('Session invalide');
    this.session = session;
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* Session lasts until this page closes. */ }
  }

  async request(path, { method = 'GET', body, token, headers = {} } = {}) {
    const response = await fetch(CLOUD_URL + path, {
      method,
      headers: {
        apikey: CLOUD_KEY,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store'
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      const error = new Error(detail.msg || detail.message || detail.error_description || detail.error || `Erreur HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async sendCode(email) {
    return this.request('/auth/v1/otp', { method: 'POST', body: { email, create_user: true } });
  }

  async verifyCode(email, token) {
    const session = await this.request('/auth/v1/verify', { method: 'POST', body: { email, token, type: 'email' } });
    this.storeSession(session);
    return session;
  }

  async refreshSession() {
    if (!this.session) throw new Error('Connexion requise');
    if (!this.refreshing) {
      this.refreshing = this.request('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: { refresh_token: this.session.refresh_token }
      }).then(session => {
        this.storeSession(session);
        return session;
      }).finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }

  async token() {
    if (!this.session) throw new Error('Connexion requise');
    if (!this.session.expires_at || Date.now() / 1000 > this.session.expires_at - 90) {
      await this.refreshSession();
    }
    return this.session.access_token;
  }

  async authorizedRequest(path, options = {}) {
    let accessToken = await this.token();
    try {
      return await this.request(path, { ...options, token: accessToken });
    } catch (error) {
      if (error.status !== 401) throw error;
      accessToken = (await this.refreshSession()).access_token;
      return this.request(path, { ...options, token: accessToken });
    }
  }

  async getProgress() {
    const rows = [];
    const pageSize = 500;
    let page = 0;
    while (true) {
      const batch = await this.authorizedRequest('/rest/v1/word_progress?select=word_id,learned&user_id=eq.' + encodeURIComponent(this.user.id), {
        headers: { Accept: 'application/json', Range: `${page * pageSize}-${(page + 1) * pageSize - 1}` }
      });
      rows.push(...batch);
      if (batch.length < pageSize) return rows;
      page++;
    }
  }

  async saveProgress(changes) {
    if (!changes.length) return;
    const rows = changes.map(([wordId, learned]) => ({
      user_id: this.user.id, word_id: wordId, learned, updated_at: new Date().toISOString()
    }));
    return this.authorizedRequest('/rest/v1/word_progress?on_conflict=user_id,word_id', {
      method: 'POST', body: rows, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }
    });
  }

  async signOut() {
    const token = this.session?.access_token;
    this.session = null;
    try { localStorage.removeItem(SESSION_KEY); } catch { /* Ignore unavailable storage. */ }
    if (token && navigator.onLine) {
      await this.request('/auth/v1/logout', { method: 'POST', token }).catch(() => {});
    }
  }
}
