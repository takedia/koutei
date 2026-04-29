<script>
  import { onMount } from 'svelte';
  import { loadSettings, saveSettings, resetSettings, isDefaultPreset } from '../lib/db.js';
  import { screen, toasts } from '../lib/stores.js';
  import { sha256Hex, verifyAdminPassword, fetchAuthInfo } from '../lib/auth.js';
  import { fetchSharedRecipients, formatRecipientsJson } from '../lib/recipients.js';
  import { notifyAccess, isAdminDevice, markAsAdminDevice, unmarkAsAdminDevice } from '../lib/beacon.js';

  let adminDeviceMarked = $state(isAdminDevice());

  function toggleAdminDevice() {
    if (adminDeviceMarked) {
      unmarkAsAdminDevice();
      adminDeviceMarked = false;
      toasts.info('この端末を管理者扱いから外しました');
    } else {
      markAsAdminDevice();
      adminDeviceMarked = true;
      toasts.info('この端末を管理者扱いにしました（以降通知なし）');
    }
  }

  /** @type {import('../lib/types.js').設定 | null} */
  let s = $state(null);
  let loadError = $state(/** @type {string|null} */ (null));

  /** @type {{ラベル:string, メアド:string}[]} */
  let sharedRecipients = $state([]);
  let sharedRecipientsLoading = $state(true);

  onMount(async () => {
    try {
      s = await loadSettings();
    } catch (e) {
      console.error('settings load failed', e);
      loadError = String(/** @type {any} */ (e)?.message ?? e);
    }
    try {
      sharedRecipients = await fetchSharedRecipients();
    } catch (e) {
      console.error('shared recipients load failed', e);
    } finally {
      sharedRecipientsLoading = false;
    }
  });

  // ── 管理者ロック（ハッシュ生成ツール・宛先プリセット編集のゲート）
  let adminUnlocked = $state(false);
  let adminInput = $state('');
  let adminBusy = $state(false);
  let adminError = $state(/** @type {string|null} */ (null));
  /** ログインパスワードが現在有効か（auth.json の passwordHash が空でないか） */
  let loginPasswordRequired = $state(/** @type {boolean|null} */ (null));

  async function refreshAuthStatus() {
    const info = await fetchAuthInfo();
    loginPasswordRequired = !!(info && typeof info.passwordHash === 'string' && info.passwordHash.trim().length > 0);
  }

  async function unlockAdmin() {
    if (!adminInput || adminBusy) return;
    adminBusy = true;
    adminError = null;
    const ok = await verifyAdminPassword(adminInput);
    adminBusy = false;
    if (ok) {
      adminUnlocked = true;
      adminInput = '';
      refreshAuthStatus();
      // 初回のみ通知 → 同時にこの端末を「管理者」としてマーク（以降通知抑制）
      if (!isAdminDevice()) {
        notifyAccess('admin-unlock');
        markAsAdminDevice();
        adminDeviceMarked = true;
      }
    } else {
      adminError = '管理者パスワードが違います';
      setTimeout(() => { adminError = null; }, 4000);
    }
  }

  function lockAdmin() {
    adminUnlocked = false;
    hashInput = '';
    hashOutput = '';
  }

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

  async function copyDisableSnippet() {
    try {
      await navigator.clipboard.writeText('"passwordHash": "",');
      toasts.info('無効化用JSONをコピーしました');
    } catch {
      toasts.error('コピー失敗');
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

  /** プリセット 1 件削除（即時保存） */
  async function removeFromPreset(/** @type {'重機プリセット'|'車両プリセット'|'回送プリセット'|'その他プリセット'|'工種辞書'} */ key, /** @type {string} */ value) {
    if (!s) return;
    if (!confirm(`「${value}」を ${key} から削除します。よろしいですか？`)) return;
    s[key] = s[key].filter((/** @type {string} */ v) => v !== value);
    await saveSettings(s);
    toasts.info('削除しました');
  }

  // ── 共有宛先の編集（管理者専用 / GitHub 反映は手動コミット）
  let sharedNewLabel = $state('');
  let sharedNewMail = $state('');
  let sharedDirty = $state(false);

  function addSharedRecipient() {
    const label = sharedNewLabel.trim();
    const mail = sharedNewMail.trim();
    if (!label || !mail) {
      toasts.error('ラベルとメアドの両方を入力してください');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      toasts.error('メアドの形式が正しくありません');
      return;
    }
    if (sharedRecipients.some(r => r.メアド.toLowerCase() === mail.toLowerCase())) {
      toasts.error('既に登録されています');
      return;
    }
    sharedRecipients = [...sharedRecipients, { ラベル: label, メアド: mail }];
    sharedNewLabel = '';
    sharedNewMail = '';
    sharedDirty = true;
  }

  /** @param {string} mail */
  function removeSharedRecipient(mail) {
    sharedRecipients = sharedRecipients.filter(r => r.メアド !== mail);
    sharedDirty = true;
  }

  async function copySharedJson() {
    try {
      await navigator.clipboard.writeText(formatRecipientsJson(sharedRecipients));
      toasts.info('共有宛先 JSON をコピーしました');
    } catch {
      toasts.error('コピー失敗');
    }
  }

  async function reloadSharedRecipients() {
    sharedRecipientsLoading = true;
    sharedRecipients = await fetchSharedRecipients();
    sharedDirty = false;
    sharedRecipientsLoading = false;
    toasts.info('共有宛先を再取得しました');
  }

  async function doResetSettings() {
    if (!confirm('設定を初期化します。\n保存した個人宛先・件名テンプレなど、この端末の設定がすべてリセットされます。\n（工程表データには影響しません）\nよろしいですか？')) return;
    await resetSettings();
    s = await loadSettings();
    toasts.info('設定を初期化しました');
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
        メール送信時の件名。次の変数が使えます: <code>{'{職長名}'}</code> <code>{'{工事番号}'}</code> <code>{'{工事名}'}</code> <code>{'{期間}'}</code> <code>{'{発注者}'}</code>
        <br />（値が空の変数は空文字に置き換わり、前後の余分な空白は自動で除去されます）
      </p>
    </section>

    <section>
      <h2>共有宛先（全員共通）</h2>
      <p class="muted small">
        全端末・全ユーザーで共有されるメール宛先。GitHub の <code>data/recipients.json</code>
        が真のデータで、編集には管理者ロック解除が必要です。
      </p>
      {#if sharedRecipientsLoading}
        <p class="muted small">読み込み中…</p>
      {:else if sharedRecipients.length === 0}
        <p class="muted small">未登録</p>
      {:else}
        <ul class="recip">
          {#each sharedRecipients as r (r.メアド)}
            <li>
              <span class="rl">{r.ラベル}</span>
              <span class="rm">{r.メアド}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section>
      <h2>工種辞書（{s.工種辞書.length}件）</h2>
      <p class="muted small">追加した語句のみ × で削除可（デフォルト語句は削除不可）</p>
      <div class="preset-grid">
        {#each s.工種辞書 as k (k)}
          <div class="preset-chip" class:locked={isDefaultPreset('工種辞書', k)}>
            <span>{k}</span>
            {#if !isDefaultPreset('工種辞書', k)}
              <button class="x" onclick={() => removeFromPreset('工種辞書', k)} aria-label={`${k} を削除`}>×</button>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <section>
      <h2>重機プリセット</h2>
      <div class="preset-grid">
        {#each s.重機プリセット as k (k)}
          <div class="preset-chip" class:locked={isDefaultPreset('重機プリセット', k)}>
            <span>{k}</span>
            {#if !isDefaultPreset('重機プリセット', k)}
              <button class="x" onclick={() => removeFromPreset('重機プリセット', k)} aria-label={`${k} を削除`}>×</button>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <section>
      <h2>車両プリセット</h2>
      <div class="preset-grid">
        {#each s.車両プリセット as k (k)}
          <div class="preset-chip" class:locked={isDefaultPreset('車両プリセット', k)}>
            <span>{k}</span>
            {#if !isDefaultPreset('車両プリセット', k)}
              <button class="x" onclick={() => removeFromPreset('車両プリセット', k)} aria-label={`${k} を削除`}>×</button>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <section>
      <h2>回送プリセット</h2>
      <div class="preset-grid">
        {#each s.回送プリセット as k (k)}
          <div class="preset-chip" class:locked={isDefaultPreset('回送プリセット', k)}>
            <span>{k}</span>
            {#if !isDefaultPreset('回送プリセット', k)}
              <button class="x" onclick={() => removeFromPreset('回送プリセット', k)} aria-label={`${k} を削除`}>×</button>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <section>
      <h2>その他プリセット</h2>
      <div class="preset-grid">
        {#each s.その他プリセット as k (k)}
          <div class="preset-chip" class:locked={isDefaultPreset('その他プリセット', k)}>
            <span>{k}</span>
            {#if !isDefaultPreset('その他プリセット', k)}
              <button class="x" onclick={() => removeFromPreset('その他プリセット', k)} aria-label={`${k} を削除`}>×</button>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <section>
      <h2>🔒 管理者メニュー</h2>
      {#if !adminUnlocked}
        <p class="muted small">
          管理者パスワードを入力すると、ログインパスワード設定の確認・ハッシュ生成・宛先プリセット編集が開きます。
        </p>
        <form class="hash-row" onsubmit={(e) => { e.preventDefault(); unlockAdmin(); }}>
          <input
            type="password"
            bind:value={adminInput}
            placeholder="管理者パスワード"
            autocomplete="off"
          />
          <button type="submit" disabled={adminBusy || !adminInput}>
            {adminBusy ? '確認中…' : 'ロック解除'}
          </button>
        </form>
        {#if adminError}
          <p class="err small">{adminError}</p>
        {/if}
      {:else}
        <div class="admin-unlocked">
          <span class="badge">解錠中</span>
          <button class="ghost small-btn" onclick={lockAdmin}>🔒 ロックする</button>
        </div>

        <!-- ログインパスワード状態 -->
        <div class="admin-sub">
          <h3>ログインパスワード</h3>
          {#if loginPasswordRequired === null}
            <p class="muted small">確認中…</p>
          {:else if loginPasswordRequired}
            <p class="small">
              <span class="badge">有効</span>
              アプリ起動時にパスワード入力が必要です。
            </p>
            <p class="muted small">
              無効化したい場合は、ハッシュ生成は<strong>使わず</strong>、
              <a href="https://github.com/takedia/koutei/edit/main/data/auth.json" target="_blank" rel="noopener">data/auth.json</a> を直接編集して
              <code>passwordHash</code> の値を空文字 <code>""</code> にしてコミットしてください。
            </p>
            <button class="ghost small-btn" onclick={copyDisableSnippet}>📋 無効化用 JSON をコピー</button>
            <p class="muted small">
              （上をコピー → auth.json 内の同じ行に貼り付け）
            </p>
          {:else}
            <p class="small">
              <span class="badge warn">無効</span>
              現在ログインパスワード無設定。誰でも起動できます。
            </p>
            <p class="muted small">
              有効化するには下の「パスワード ハッシュ生成」で新ハッシュを作り、
              <a href="https://github.com/takedia/koutei/edit/main/data/auth.json" target="_blank" rel="noopener">data/auth.json</a>
              の <code>passwordHash</code> に貼り付けてコミット。
            </p>
          {/if}
        </div>

        <!-- ハッシュ生成 -->
        <div class="admin-sub">
          <h3>パスワード ハッシュ生成</h3>
          <p class="muted small">
            生成したハッシュを GitHub の <code>data/auth.json</code> の
            <code>passwordHash</code>（ログイン用）または <code>adminPasswordHash</code>（管理者用）に貼り付け。
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
              <a href="https://github.com/takedia/koutei/edit/main/data/auth.json" target="_blank" rel="noopener">data/auth.json を開く</a>
              → 該当キーの値を置き換え → Commit changes
            </p>
          {/if}
        </div>

        <!-- 共有宛先編集 -->
        <div class="admin-sub">
          <h3>共有宛先（全員共通）の編集</h3>
          <p class="muted small">
            ここで編集 → 「📋 JSON コピー」→ GitHub の
            <a href="https://github.com/takedia/koutei/edit/main/data/recipients.json" target="_blank" rel="noopener">data/recipients.json</a>
            に貼り付け → Commit。1〜5 分以内に全端末で反映されます。
          </p>

          {#if sharedRecipients.length === 0}
            <p class="muted small">未登録</p>
          {:else}
            <ul class="recip">
              {#each sharedRecipients as r (r.メアド)}
                <li>
                  <span class="rl">{r.ラベル}</span>
                  <span class="rm">{r.メアド}</span>
                  <button class="x" onclick={() => removeSharedRecipient(r.メアド)} aria-label="削除">×</button>
                </li>
              {/each}
            </ul>
          {/if}

          <div class="recip-add">
            <input
              type="text"
              bind:value={sharedNewLabel}
              placeholder="ラベル（例: 会社）"
              aria-label="ラベル"
            />
            <input
              type="email"
              bind:value={sharedNewMail}
              placeholder="メールアドレス"
              aria-label="メアド"
              autocomplete="email"
            />
            <button onclick={addSharedRecipient}>＋追加</button>
          </div>

          <div class="shared-actions">
            {#if sharedDirty}
              <span class="badge warn">未コミット</span>
            {/if}
            <button class="primary" onclick={copySharedJson}>📋 JSON コピー</button>
            <button class="ghost" onclick={reloadSharedRecipients}>🔄 GitHub から再取得</button>
          </div>
        </div>

        <!-- 個人宛先プリセット編集（端末ローカル） -->
        <div class="admin-sub">
          <h3>個人宛先（この端末のみ）</h3>
          <p class="muted small">
            この端末でのみ使う宛先。共有宛先と合わせてメール送信時に表示されます。
          </p>

          {#if s.宛先プリセット.length === 0}
            <p class="muted small">未登録</p>
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
              placeholder="ラベル"
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
        </div>

        <!-- アクセス通知（ntfy）の管理者抑制 -->
        <div class="admin-sub">
          <h3>アクセス通知の自分宛抑制</h3>
          <p class="muted small">
            この端末を「管理者」扱いにしておくと、自分の操作（ログイン・解錠等）で
            ntfy 通知が飛ばなくなります。状態：
            {#if adminDeviceMarked}
              <span class="badge">管理者扱い（通知なし）</span>
            {:else}
              <span class="badge warn">通常端末（通知あり）</span>
            {/if}
          </p>
          <button class="ghost small-btn" onclick={toggleAdminDevice}>
            {adminDeviceMarked ? '🔔 通知ありに戻す' : '🔕 この端末を管理者扱いにする'}
          </button>
        </div>

        <!-- 設定の初期化（端末ローカル） -->
        <div class="admin-sub">
          <h3>設定を初期化</h3>
          <p class="muted small">
            この端末の設定（件名テンプレ・個人宛先・各種プリセット）を破棄して、
            アプリ標準のデフォルトに戻します。コードの defaultSettings を変更した
            のに反映されない時にこちらを実行してください。
            <strong>工程表データには影響しません。</strong>
          </p>
          <button class="ghost" onclick={doResetSettings}>♻️ 設定を初期化</button>
        </div>
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
  .preset-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }
  .preset-chip {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--c-border);
    border-radius: 6px;
    background: #fff;
    overflow: hidden;
    min-height: 34px;
  }
  .preset-chip > span {
    padding: 0 10px;
    font-size: 13px;
  }
  /* デフォルト由来（削除不可）はやや薄い背景＋鍵アイコンで識別 */
  .preset-chip.locked {
    background: #f3f4f6;
    color: #6b7280;
  }
  .preset-chip.locked > span {
    padding: 0 10px;
  }
  .preset-chip.locked > span::before {
    content: '🔒 ';
    font-size: 10px;
  }
  .preset-chip .x {
    border: none;
    background: transparent;
    color: #dc2626;
    font-size: 18px;
    line-height: 1;
    padding: 0 8px;
    min-height: 34px;
    min-width: 28px;
    border-radius: 0;
  }
  .preset-chip .x:hover, .preset-chip .x:active { background: #fee2e2; }
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
  .err.small {
    background: transparent;
    border: none;
    padding: 4px 0;
    font-size: 12px;
  }
  .admin-unlocked {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  .badge {
    background: #ecfdf5;
    color: #059669;
    border: 1px solid #6ee7b7;
    border-radius: 999px;
    padding: 2px 10px;
    font-size: 12px;
    font-weight: 600;
  }
  .small-btn {
    min-height: 32px;
    padding: 0 10px;
    font-size: 12px;
  }
  .admin-sub {
    border-top: 1px dashed var(--c-border);
    padding-top: 10px;
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .admin-sub h3 {
    margin: 0 0 4px 0;
    font-size: 13px;
    font-weight: 700;
  }
  .badge.warn {
    background: #fff7ed;
    color: #c2410c;
    border-color: #fdba74;
  }
  .shared-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 8px;
  }
  .shared-actions button {
    flex-shrink: 0;
  }
</style>
