import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';

const LAST_USERNAME_KEY = 'isola.lastUsername';

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();
  const toast     = useToast();

  // Подтянуть последний логин — пароль iOS/Chrome предложит сам через autocomplete
  useEffect(() => {
    const last = localStorage.getItem(LAST_USERNAME_KEY);
    if (last) setForm(p => ({ ...p, username: last }));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.username, form.password);
      if (remember) {
        localStorage.setItem(LAST_USERNAME_KEY, form.username);
      } else {
        localStorage.removeItem(LAST_USERNAME_KEY);
      }
      navigate('/');
    } catch (err) {
      toast(err.response?.data?.error || 'Ошибка входа', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-screen-inner">
        <div className="login-logo-wrap">
          <div className="logo-plate">
            <img src="/isola-logo.jpg" alt="ISOLA" />
          </div>
          <div className="login-tagline">Управление инструментами цеха</div>
        </div>

        <div className="login-card">
          <h2>Вход в систему</h2>
          <div className="login-card-sub">Введите логин и пароль</div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Логин</label>
              <input
                className="form-input"
                type="text"
                name="username"
                value={form.username}
                onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                placeholder="например, ulugbek"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Пароль</label>
              <input
                className="form-input"
                type="password"
                name="password"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            <label className="form-checkbox" style={{ marginBottom: 18 }}>
              <input
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
              />
              <span>Запомнить меня на этом устройстве</span>
            </label>

            <button
              className="btn btn-primary btn-lg"
              type="submit"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {loading ? 'Вход…' : 'Войти'}
            </button>
          </form>
        </div>

        <div className="login-footer-note">
          ISOLA Interior Solutions
        </div>
      </div>
    </div>
  );
}
