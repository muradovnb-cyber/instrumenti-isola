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
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #1e293b 0%, #1a56db 100%)',
      padding: '20px'
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 56 }}>🏭</div>
          <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 800, marginTop: 10 }}>{t('loginTitle')}</h1>
          <p style={{ color: '#93c5fd', fontSize: 14, marginTop: 6 }}>{t('loginSubtitle')}</p>
        </div>

        <div className="card" style={{ padding: '32px' }}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">👤 {t('username')}</label>
              <input
                className="form-input"
                type="text"
                value={form.username}
                onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                placeholder="director / chief / warehouse / master1"
                required autoFocus
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
