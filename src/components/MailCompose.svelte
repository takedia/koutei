<script>
  import { buildMailto } from '../lib/export/mail.js';
  import { isProblematicForIosShare } from '../lib/export/filename.js';

  /** @type {{
   *   open: boolean,
   *   blob: Blob|null,
   *   filename: string,
   *   defaultSubject: string,
   *   defaultBody: string,
   *   presets: {ラベル: string, メアド: string}[],
   *   onAddPreset: (preset: {ラベル: string, メアド: string}) => Promise<void>,
   *   onCancel: () => void,
   *   onSend: () => void
   * }} */
  let { open, blob, filename, defaultSubject, defaultBody, presets, onAddPreset, onCancel, onSend } = $props();

  /** Web Share API でファイル付き共有が使える環境かを判定（毎回 blob が変わるので $derived）
   *  iOS の xlsx 等は受信側がテキスト化するため、Web Share をスキップして mailto: 添付フローへ */
  let canShareFile = $derived(
    !!blob && typeof navigator !== 'undefined' &&
    typeof (/** @type {any} */ (navigator).canShare) === 'function' &&
    typeof (/** @type {any} */ (navigator).share) === 'function' &&
    !isProblematicForIosShare(blob) &&
    (() => {
      try {
        const probe = new File([blob], filename || 'file', { type: blob.type || 'application/octet-stream' });
        return /** @type {any} */ (navigator).canShare({ files: [probe] });
      } catch { return false; }
    })()
  );

  /** @type {Set<string>} */
  let selected = $state(new Set());
  let subject = $state('');
  let body = $state('');
  let manualLabel = $state('');
  let manualMail = $state('');
  let savingPreset = $state(false);

  $effect(() => {
    if (open) {
      // 開く時に値をリセット
      selected = new Set();
      subject = defaultSubject;
      body = defaultBody;
      manualLabel = '';
      manualMail = '';
    }
  });

  /** @param {string} mail */
  function toggle(mail) {
    const next = new Set(selected);
    if (next.has(mail)) next.delete(mail);
    else next.add(mail);
    selected = next;
  }

  /** 「その他」欄の内容をプリセットに保存 */
  async function savePreset() {
    const mail = manualMail.trim();
    if (!mail) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return;
    if (presets.some(p => p.メアド.toLowerCase() === mail.toLowerCase())) return;
    const label = manualLabel.trim() || mail;
    savingPreset = true;
    try {
      await onAddPreset({ ラベル: label, メアド: mail });
      // 保存後はチェック済み状態にして手動欄をクリア
      const next = new Set(selected);
      next.add(mail);
      selected = next;
      manualLabel = '';
      manualMail = '';
    } finally {
      savingPreset = false;
    }
  }

  function recipientsList() {
    const list = [...selected];
    const manual = manualMail.trim();
    if (manual && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manual)) {
      if (!list.includes(manual)) list.push(manual);
    }
    return list;
  }

  /** Web Share API: ファイルをそのままメールアプリ等に渡す（添付済みで開く） */
  async function shareFile() {
    if (!blob) return;
    const list = recipientsList();
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    const text = [
      list.length ? `宛先候補: ${list.join(', ')}` : '',
      body
    ].filter(Boolean).join('\n\n');
    try {
      await /** @type {any} */ (navigator).share({
        files: [file],
        title: subject,
        text
      });
      onSend();
    } catch (e) {
      const name = /** @type {any} */ (e)?.name;
      if (name === 'AbortError') return; // ユーザーキャンセル
      console.warn('share failed, fallback to mailto', e);
      composeMailto();
    }
  }

  /** mailto: フォールバック（ファイルは既にダウンロード済みなので手動添付） */
  function composeMailto() {
    const url = buildMailto(recipientsList(), subject, body);
    location.href = url;
    onSend();
  }

  function compose() {
    if (canShareFile) {
      shareFile();
    } else {
      composeMailto();
    }
  }
</script>

{#if open}
  <div class="backdrop" role="dialog" aria-modal="true">
    <button class="bg" onclick={onCancel} aria-label="閉じる"></button>
    <div class="sheet">
      <header>
        <h2>メールで送信</h2>
        <button class="x" onclick={onCancel} aria-label="閉じる">×</button>
      </header>

      <div class="body">
        {#if canShareFile}
          <div class="note">
            <p class="note-head">📎 ファイル <code>{filename}</code> を<strong>添付済み</strong>でメールアプリに渡します。</p>
            <details class="howto">
              <summary>送信手順（タップで開閉）</summary>
              <ol class="steps">
                <li>下の <strong>「✉️📎 ファイル付き共有」</strong> ボタンを押す</li>
                <li>共有メニューから <strong>「メール」「Gmail」</strong> など使うメールアプリを選ぶ</li>
                <li>ファイルが<strong>添付された状態</strong>でメール作成画面が開く</li>
                <li>宛先・件名・本文を確認して<strong>送信</strong></li>
              </ol>
            </details>
          </div>
        {:else}
          <div class="note">
            <p class="note-head">📎 添付ファイル <code>{filename}</code> は<strong>すでに保存済み</strong>です。メールアプリで手動添付してください。</p>
            <details class="howto" open>
              <summary>送信手順（タップで開閉）</summary>
              <ol class="steps">
                <li>下の <strong>「✉️ メールアプリを開く」</strong> ボタンを押す</li>
                <li>メールアプリが起動し、宛先・件名・本文がセットされた状態で開く</li>
                <li>メール作成画面の <strong>📎 (クリップマーク)</strong> または <strong>「添付」</strong> ボタンを押す</li>
                <li><strong>「ファイル」「ダウンロード」</strong> アプリを開き、先ほど保存した <code>{filename}</code> を選択して添付</li>
                <li>添付できたら<strong>送信</strong></li>
              </ol>
              <p class="tip">💡 ファイルが見つからない時は、iPhone なら「ファイル」アプリ → 「最近使った項目」、Android なら「Files」アプリ → 「ダウンロード」フォルダを確認。</p>
            </details>
          </div>
        {/if}

        <section>
          <h3>宛先（複数選択可）</h3>
          {#if presets.length === 0}
            <p class="muted">プリセット未登録。設定画面から追加できます。</p>
          {:else}
            <ul class="presets">
              {#each presets as p (p.メアド)}
                <li>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.has(p.メアド)}
                      onchange={() => toggle(p.メアド)}
                    />
                    <span class="lab">{p.ラベル}</span>
                    <span class="ml">{p.メアド}</span>
                  </label>
                </li>
              {/each}
            </ul>
          {/if}
          <div class="manual">
            <p class="muted small">その他の宛先（プリセット未登録）も入力可。</p>
            <div class="manual-row">
              <input
                type="text"
                bind:value={manualLabel}
                placeholder="ラベル（任意）"
              />
              <input
                type="email"
                bind:value={manualMail}
                placeholder="メールアドレス"
                autocomplete="email"
              />
              <button
                type="button"
                onclick={savePreset}
                disabled={savingPreset || !manualMail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualMail.trim()) || presets.some(p => p.メアド.toLowerCase() === manualMail.trim().toLowerCase())}
                title="このアドレスを宛先プリセットに保存"
              >
                💾 保存
              </button>
            </div>
          </div>
        </section>

        <section>
          <h3>件名</h3>
          <input type="text" bind:value={subject} />
        </section>

        <section>
          <h3>本文</h3>
          <textarea bind:value={body} rows="6"></textarea>
        </section>
      </div>

      <footer>
        <button class="ghost" onclick={onCancel}>キャンセル</button>
        <button class="primary" onclick={compose}>
          {canShareFile ? '✉️📎 ファイル付き共有' : '✉️ メールアプリを開く'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 12px;
  }
  .bg {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.6);
    border: none;
  }
  .sheet {
    position: relative;
    background: #fff;
    border-radius: 12px;
    width: 100%;
    max-width: 560px;
    max-height: 90dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--c-border);
  }
  header h2 { margin: 0; font-size: 16px; }
  .x { border: none; background: transparent; font-size: 24px; padding: 0 8px; }
  .body {
    overflow: auto;
    padding: 14px;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .note {
    background: #fff7d6;
    border: 1px solid #f6d860;
    border-radius: 8px;
    padding: 10px 12px;
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
  }
  .note-head {
    margin: 0 0 4px 0;
  }
  .howto {
    margin-top: 6px;
  }
  .howto > summary {
    cursor: pointer;
    font-weight: 600;
    padding: 4px 0;
    user-select: none;
  }
  .steps {
    margin: 6px 0 4px 0;
    padding-left: 20px;
  }
  .steps li {
    margin: 4px 0;
  }
  .tip {
    background: #fffbe6;
    border-top: 1px dashed #e5d76b;
    margin: 8px 0 0 0;
    padding-top: 6px;
    font-size: 12px;
    color: #6b5d00;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  h3 {
    margin: 0;
    font-size: 13px;
    color: var(--c-muted);
    font-weight: 600;
  }
  .presets {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .presets li {
    margin: 4px 0;
  }
  .presets label {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--c-border);
    border-radius: 6px;
    cursor: pointer;
    background: #fff;
  }
  .lab {
    font-weight: 600;
    flex-shrink: 0;
    min-width: 70px;
  }
  .ml {
    flex: 1;
    font-size: 12px;
    color: var(--c-muted);
    word-break: break-all;
  }
  .muted {
    color: var(--c-muted);
    margin: 0;
    font-size: 13px;
  }
  .manual {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
  }
  .manual-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
  .manual-row input[type="text"] {
    width: 110px;
    flex: 0 0 auto;
  }
  .manual-row input[type="email"] {
    flex: 1;
    min-width: 160px;
  }
  .manual-row button {
    flex-shrink: 0;
    min-height: 36px;
    font-size: 13px;
  }
  .manual-row button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  textarea {
    width: 100%;
    font: inherit;
    border: 1px solid var(--c-border);
    border-radius: 6px;
    padding: 8px 10px;
    background: #fff;
    resize: vertical;
  }
  code {
    background: #f3f4f6;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 12px;
  }
  footer {
    display: flex;
    gap: 8px;
    padding: 10px 14px;
    border-top: 1px solid var(--c-border);
    align-items: center;
    justify-content: flex-end;
  }
  .ghost {
    background: transparent;
  }
  footer .primary {
    min-width: 180px;
  }
</style>
