<script>
  import { verifyPassword, authed, authError } from '../lib/auth.js';
  import { version, buildLabel } from '../lib/version.js';

  let password = $state('');
  let busy = $state(false);
  let errorMsg = $state(/** @type {string|null} */ (null));

  async function submit() {
    if (busy || !password) return;
    busy = true;
    errorMsg = null;
    const ok = await verifyPassword(password);
    busy = false;
    if (ok) {
      authed.set(true);
      password = '';
    } else {
      // authError は fetch 失敗の詳細、それ以外は単に不一致
      errorMsg = $authError ?? 'パスワードが一致しません';
      // 失敗メッセージを少し残してから消す
      setTimeout(() => { errorMsg = null; }, 4000);
    }
  }

  function onKey(/** @type {KeyboardEvent} */ ev) {
    if (ev.key === 'Enter') submit();
  }
</script>

<div class="screen">
  <form class="card" onsubmit={(e) => { e.preventDefault(); submit(); }}>
    <h1>現場工程表</h1>
    <p class="muted">パスワードを入力してください</p>

    <input
      type="password"
      bind:value={password}
      onkeydown={onKey}
      autocomplete="current-password"
      placeholder="パスワード"
      aria-label="パスワード"
      autofocus
    />

    <button class="primary" type="submit" disabled={busy || !password}>
      {busy ? '確認中…' : 'OK'}
    </button>

    {#if errorMsg}
      <p class="err">{errorMsg}</p>
    {/if}

    <p class="version">v{version}{buildLabel() ? ` · ${buildLabel()}` : ''}</p>
  </form>
</div>

<style>
  .screen {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%);
  }
  .card {
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.08);
    padding: 24px;
    width: 100%;
    max-width: 380px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  h1 {
    margin: 0;
    text-align: center;
    font-size: 18px;
  }
  .muted {
    margin: 0;
    text-align: center;
    color: var(--c-muted);
    font-size: 13px;
  }
  input {
    width: 100%;
    font-size: 16px;
  }
  button {
    width: 100%;
    min-height: 44px;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .err {
    margin: 0;
    color: #dc2626;
    text-align: center;
    font-size: 13px;
  }
  .version {
    margin: 0;
    text-align: center;
    color: var(--c-muted);
    font-size: 11px;
    font-family: ui-monospace, "Courier New", monospace;
  }
</style>
