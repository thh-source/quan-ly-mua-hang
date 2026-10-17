"use client";
import { FormEvent, useState } from "react";

export default function LoginForm() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget),
      response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password"),
        }),
      });
    if (response.ok) location.reload();
    else {
      setError("ID hoặc mật khẩu không đúng");
      setBusy(false);
    }
  };
  return (
    <main className="login-page">
      <form onSubmit={submit}>
        <div className="login-brand">
          <img src="/phenikaa-logo.png" alt="Phenikaa Pharma" />
        </div>
        <em>PHENIKAA PHARMA</em>
        <h1>Đăng nhập</h1>
        <p>Hệ thống quản lý mua sắm, PR, PO, hợp đồng và hồ sơ thanh toán.</p>
        <label>
          ID người dùng
          <input name="username" autoComplete="username" required autoFocus />
        </label>
        <label>
          Mật khẩu
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error && <div className="login-error">⚠ {error}</div>}
        <button disabled={busy}>
          {busy ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
        <small>Phiên đăng nhập tự hết hạn sau 12 giờ.</small>
      </form>
    </main>
  );
}
