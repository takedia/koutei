<script>
  /** @type {{
   *   open: boolean,
   *   kind: 'png'|'pdf'|null,
   *   url: string|null,
   *   filename: string,
   *   onDownload: () => void,
   *   onSendMail: () => void,
   *   onCancel: () => void
   * }} */
  let { open, kind, url, filename, onDownload, onSendMail, onCancel } = $props();
</script>

{#if open && url}
  <div class="backdrop" role="dialog" aria-modal="true">
    <button class="bg" onclick={onCancel} aria-label="閉じる"></button>
    <div class="sheet">
      <header>
        <h2>{kind === 'pdf' ? 'PDF プレビュー' : '画像 プレビュー'}</h2>
        <button class="x" onclick={onCancel} aria-label="閉じる">×</button>
      </header>

      <div class="body">
        {#if kind === 'png' && url}
          <img src={url} alt="工程表プレビュー" />
        {:else if kind === 'pdf' && url}
          <iframe src={url} title="工程表プレビュー"></iframe>
        {/if}
      </div>

      <footer>
        <div class="filename">{filename}</div>
        <button class="ghost" onclick={onCancel}>閉じる</button>
        <button class="primary" onclick={onSendMail}>✉️ メール</button>
        <button class="primary" onclick={onDownload}>📥 ダウンロード</button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
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
    max-width: 1100px;
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
    padding: 12px;
    background: #f3f4f6;
    flex: 1;
    display: flex;
    align-items: flex-start;
    justify-content: center;
  }
  .body img {
    max-width: 100%;
    height: auto;
    display: block;
    background: #fff;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }
  .body iframe {
    width: 100%;
    height: 70dvh;
    border: none;
    background: #fff;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }
  footer {
    display: flex;
    gap: 8px;
    padding: 10px 14px;
    border-top: 1px solid var(--c-border);
    align-items: center;
  }
  .filename {
    flex: 1;
    font-size: 12px;
    color: var(--c-muted);
    word-break: break-all;
  }
  .ghost { background: transparent; }
  footer .primary { min-width: 120px; }
</style>
