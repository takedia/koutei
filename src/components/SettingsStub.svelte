<script>
  import { onMount } from 'svelte';
  import { loadSettings, saveSettings } from '../lib/db.js';
  import { screen, toasts } from '../lib/stores.js';
  import { sha256Hex } from '../lib/auth.js';

  /** @type {import('../lib/types.js').設定 | null} */
  let s = $state(null);
  let loadError = $state(/** @type {string|null} */ (null));

  onMount(async () => {
    try {
      s = await loadSettings();
    } catch (e) {
      console.error('settings load failed', e);
      loadError = String(/** @type {any} */ (e)?.message ?? e);
    }
  });

  // ── ハッシュ生成ツール
  let hashInput = $state('');
  let hashOutput = $state('');
  let hashBusy = $state(false);

  async function generateHash() {
    if (!hashInput) return;
    hashBusy = true;
    try {
      hashOutput = await sha256Hex(hashInput);
    } finally {
      hashBusy = false;
    }
  }

  async function copyHash() {
    if (!hashOutput) return;
    try {
      await navigator.clipboard.writeText(hashOutput);
      toasts.info('ハッシュをコピーしました');
    } catch {
      toasts.error('コピー失敗。手動で選択してコピーしてください');
    }
  }

  async function save() {
    if (!s) return;
    await saveSettings(s);
    toasts.info('設定を保存しました');
    screen.set('home');
  }

  // ── 宛先プリセット 編集
  let newLabel = $state('');
  let newMail = $state('');

  function addRecipient() {
    if (!s) return;
    const label = newLabel.trim();
    const mail = newMail.trim();
    if (!label || !mail) {
      toasts.error('ラベルとメアドの両方を入力してください');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      toasts.error('メアドの形式が正しくありません');
      return;
    }
    if (s.宛先プリセット.some(r => r.メアド.toLowerCase() === mail.toLowerCase())) {
      toasts.error('同じメアドが既に登録されています');
      return;
    }
    s.宛先プリセット = [...s.宛先プリセット, { ラベル: label, メアド: mail }];
    newLabel = '';
    newMail = '';
  }

  /** @param {string} mail */
  function removeRecipient(mail) {
    if (!s) return;
    s.宛先プリセット = s.宛先プリセット.filter(r => r.メアド !== mail);
  }
</script>

<header>
  <button class="icon" onclick={() => screen.set('home')}>←</button>
  <h1>設定</h1>
  <button class="primary" onclick={save}>💾 保存</button>
</header>

<main>
  {#if loadError}
    <p class="err">設定の読み込みに失敗しました: {loadError}</p>
  {:else if !s}
    <p>読み込み中…</p>
  {:else}
    <section>
      <h2>件名テンプレ</h2>
      <input type="text" bind:value={s.件名テンプレ} />
      <p class="muted small">
        メール送信時の件名。次の変数が使えます: <code>{'{工事番号}'}</code> <code>{'{工事名}'}</code> <code>{'{期間}'}</code> <code>{'{発注者}'}</code>
      </p>
    </section>

    <section>
      <h2>工種辞書（{s.工種辞書.length}件）</h2>
      <ul>{#each s.工種辞書 as k (k)}<li>{k}</li>{/each}</ul>
    </section>

    <section>
      <h2>重機プリセット</h2>
      <ul>{#each s.重機プリセット as k (k)}<li>{k}</li>{/each}</ul>
    </section>

    <section>
      <h2>車両プリセット</h2>
      <ul>{#each s.車両プリセット as k (k)}<li>{k}</li>{/each}</ul>
    </section>

    <section>
      <h2>宛先プリセット</h2>
      <p class="muted small">出力したファイルをメールで送る時の宛先候補。複数登録可。</p>

      {#if s.宛先プリセット.length === 0}
        <p class="muted">未登録</p>
      {:else}
        <ul class="recip">
          {#each s.宛先プリセット as a (a.メアド)}
            <li>
              <span class="rl">{a.ラベル}</span>
              <span class="rm">{a.メアド}</span>
              <button class="x" onclick={() => removeRecipient(a.メアド)} aria-label="削除">×</button>
            </li>
          {/each}
        </ul>
      {/if}

      <div class="recip-add">
        <input
          type="text"
          bind:value={newLabel}
          placeholder="ラベル（例: 会社）"
          aria-label="ラベル"
        />
        <input
          type="email"
          bind:value={newMail}
          placeholder="メールアドレス"
          aria-label="メアド"
          autocomplete="email"
        />
        <button onclick={addRecipient}>＋追加</button>
      </div>
    </section>

    <section>
      <h2>GitHub</h2>
      {#if s.PAT暗号化}
        <p>登録済み</p>
      {:else}
        <p class="muted">未登録（Phase 5で登録UIを実装）</p>
      {/if}
    </section>

    <section>
      <h2>パスワード ハッシュ生成</h2>
      <p class="muted small">
        新しいパスワードを入力してハッシュを生成、GitHub の <code>data/auth.json</code> の
        <code>passwordHash</code> に貼り付けて保存すれば変更完了です。
      </p>
      <div class="hash-row">
        <input
          type="text"
          bind:value={hashInput}
          placeholder="新しいパスワードを入力"
          autocomplete="off"
        />
        <button onclick={generateHash} disabled={hashBusy || !hashInput}>
          生成
        </button>
      </div>
      {#if hashOutput}
        <div class="hash-output">
          <code>{hashOutput}</code>
          <button class="primary" onclick={copyHash}>📋 コピー</button>
        </div>
        <p class="muted small">
          上記をコピー → github.com で
          <a href="https://github.com/takedia/koutei/edit/main/data/auth.json" target="_blank" rel="noopener">data/auth.json を開く</a>
          → <code>passwordHash</code> の値を置き換え → Commit changes
        </p>
      {/if}
    </section>
  {/if}
</main>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--c-border);
    background: #fff;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .icon {
    border: none;
    background: transparent;
    font-size: 22px;
    min-width: 36px;
    padding: 0;
  }
  h1 {
    flex: 1;
    margin: 0;
    font-size: 16px;
    text-align: center;
  }
  main {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 720px;
    margin: 0 auto;
  }
  section {
    border: 1px solid var(--c-border);
    border-radius: 10px;
    padding: 12px 14px;
    background: #fff;
  }
  h2 {
    margin: 0 0 8px 0;
    font-size: 14px;
    color: var(--c-muted);
  }
  .muted {
    color: var(--c-muted);
    margin: 0;
  }
  ul {
    margin: 0;
    padding: 0 0 0 18px;
    font-size: 14px;
    line-height: 1.7;
  }
  .small {
    font-size: 12px;
  }
  .hash-row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }
  .hash-row input {
    flex: 1;
    min-width: 0;
  }
  .hash-output {
    display: flex;
    gap: 8px;
    align-items: center;
    background: #f3f4f6;
    border-radius: 6px;
    padding: 8px 10px;
    margin: 8px 0;
  }
  .hash-output code {
    flex: 1;
    word-break: break-all;
    font-size: 11px;
    font-family: ui-monospace, "Courier New", monospace;
  }
  .hash-output button {
    flex-shrink: 0;
  }
  code {
    background: #f3f4f6;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 12px;
  }
  .recip {
    list-style: none;
    padding: 0;
    margin: 8px 0;
  }
  .recip li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border: 1px solid var(--c-border);
    border-radius: 6px;
    margin-bottom: 6px;
    background: #fff;
  }
  .rl {
    font-weight: 600;
    flex-shrink: 0;
    min-width: 80px;
  }
  .rm {
    flex: 1;
    color: var(--c-muted);
    font-size: 13px;
    word-break: break-all;
  }
  .recip li .x {
    border: none;
    background: transparent;
    font-size: 18px;
    color: #dc2626;
    min-width: 28px;
    min-height: 28px;
    padding: 0;
  }
  .recip-add {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
    margin-top: 6px;
  }
  .recip-add input[type="text"] {
    width: 130px;
    flex: 0 0 auto;
  }
  .recip-add input[type="email"] {
    flex: 1;
    min-width: 180px;
  }
  .recip-add button {
    flex-shrink: 0;
  }
  .err {
    color: #dc2626;
    background: #fee2e2;
    border: 1px solid #fca5a5;
    border-radius: 8px;
    padding: 10px 12px;
    margin: 0;
  }
</style>
