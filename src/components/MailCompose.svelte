<script>
  import { buildMailto } from '../lib/export/mail.js';

  /** @type {{
   *   open: boolean,
   *   filename: string,
   *   defaultSubject: string,
   *   defaultBody: string,
   *   presets: {ラベル: string, メアド: string}[],
   *   onCancel: () => void,
   *   onSend: () => void
   * }} */
  let { open, filename, defaultSubject, defaultBody, presets, onCancel, onSend } = $props();

  /** @type {Set<string>} */
  let selected = $state(new Set());
  let subject = $state('');
  let body = $state('');
  let manualMail = $state('');

  $effect(() => {
    if (open) {
      // 開く時に値をリセット
      selected = new Set();
      subject = defaultSubject;
      body = defaultBody;
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

  function compose() {
    const list = [...selected];
    const manual = manualMail.trim();
    if (manual && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manual)) {
      if (!list.includes(manual)) list.push(manual);
    }
    if (list.length === 0) {
      // 宛先未選択でも mailto: を開いてユーザーが手動で入れられるようにする
    }
    const url = buildMailto(list, subject, body);
    location.href = url;
    onSend();
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
        <p class="note">
          📎 添付ファイル <code>{filename}</code> は<strong>すでにダウンロード済み</strong>です。
          メールアプリが開いたら、手動でこのファイルを添付してください。
        </p>

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
            <input
              type="email"
              bind:value={manualMail}
              placeholder="その他のメアドを入力（任意）"
              autocomplete="email"
            />
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
        <button class="primary" onclick={compose}>✉️ メールアプリを開く</button>
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
  .manual input {
    width: 100%;
    margin-top: 4px;
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
