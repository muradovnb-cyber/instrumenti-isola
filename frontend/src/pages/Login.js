import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import { t } from '../utils/i18n';

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();
  const toast     = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.username, form.password);
      navigate('/');
    } catch (err) {
      toast(err.response?.data?.error || t('error'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-screen-inner">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 48 }}>🏭</div>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 800, marginTop: 8 }}>{t('loginTitle')}</h1>
          <p style={{ color: '#93c5fd', fontSize: 13, marginTop: 4 }}>{t('loginSubtitle')}</p>
        </div>

        <div className="card" style={{ padding: '24px' }}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">👤 {t('username')}</label>
              <input
                className="form-input"
                type="text"
                value={form.username}
                onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                placeholder="director / chief / warehouse / master1"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">🔒 {t('password')}</label>
              <input
                className="form-input"
                type="password"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder="admin123"
                autoComplete="current-password"
                required
              />
            </div>
            <button className="btn btn-primary btn-lg" type="submit" disabled={loading}
              style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
              {loading ? '⏳ ...' : `🔑 ${t('login')}`}
            </button>
          </form>

          <div style={{ marginTop: 20, padding: 14, background: '#f0fdf4', borderRadius: 8, fontSize: 12, color: '#166534' }}>
            <strong>Тест аккаунты (пароль: admin123):</strong><br />
            director · chief · warehouse · master1 · master2
          </div>
        </div>
      </div>
    </div>
  );
}
