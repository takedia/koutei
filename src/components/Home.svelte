<script>
  import { onMount } from 'svelte';
  import { loadIndexByMonth, deleteKoutei } from '../lib/db.js';
  import { createKoutei } from '../lib/types.js';
  import { screen, editingId, draftKoutei, toasts } from '../lib/stores.js';
  import { formatRange } from '../lib/utils/date.js';
  import { version, buildLabel } from '../lib/version.js';

  /** @type {[string, import('../lib/db.js').IndexEntry[]][]} */
  let groups = $state([]);
  let loading = $state(true);

  async function reload() {
    loading = true;
    groups = await loadIndexByMonth();
    loading = false;
  }

  onMount(reload);

  async function newKoutei() {
    const k = createKoutei({ 提出種別: '2週' });
    // ドラフトとしてメモリ保持。保存ボタンが押されるまで DB に書かない
    draftKoutei.set(k);
    editingId.set(k.id);
    screen.set('editor');
  }

  /** @param {string} id */
  function open(id) {
    editingId.set(id);
    screen.set('editor');
  }

  /** @param {string} id @param {string} name */
  async function remove(id, name) {
    if (!confirm(`「${name}」を削除します。よろしいですか？`)) return;
    await deleteKoutei(id);
    toasts.info('削除しました');
    await reload();
  }
</script>

<header>
  <h1>現場工程表</h1>
  <button class="icon" onclick={() => screen.set('settings')} aria-label="設定">⚙</button>
</header>

<main>
  <button class="primary big" onclick={newKoutei}>＋ 新規工程表</button>

  {#if loading}
    <p class="muted">読み込み中…</p>
  {:else if groups.length === 0}
    <p class="muted">まだ工程表はありません。「＋ 新規工程表」から作成してください。</p>
  {:else}
    {#each groups as [month, entries] (month)}
      <section>
        <h2>{month.replace('-', '年')}月</h2>
        <ul>
          {#each entries as e (`${month}-${e.id}`)}
            <li>
              <button class="row" onclick={() => open(e.id)}>
                <div class="title">
                  {e.工事名表示}
                  {#if e.終了月 && e.終了月 !== e.月}
                    <span class="span-badge" title="月をまたぐ工程表">月またぎ</span>
                  {/if}
                </div>
                <div class="sub">
                  <span class="badge">{e.提出種別}</span>
                  <span>{e.期間表示}</span>
                </div>
              </button>
              <button class="del" onclick={() => remove(e.id, e.工事名表示)} aria-label="削除">🗑</button>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}

  <p class="version">v{version}{buildLabel() ? ` · ${buildLabel()}` : ''}</p>
</main>

<style>
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--c-border);
    background: #fff;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  h1 {
    margin: 0;
    font-size: 18px;
  }
  .icon {
    border: none;
    background: transparent;
    font-size: 22px;
    padding: 0 8px;
  }
  main {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 720px;
    margin: 0 auto;
  }
  .big {
    width: 100%;
    padding: 14px;
    font-size: 16px;
    font-weight: 600;
  }
  .muted {
    color: var(--c-muted);
    text-align: center;
    margin: 24px 0;
  }
  section h2 {
    font-size: 14px;
    color: var(--c-muted);
    margin: 8px 0;
    font-weight: 600;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  li {
    display: flex;
    gap: 6px;
    align-items: stretch;
  }
  .row {
    flex: 1;
    text-align: left;
    background: #fff;
    border: 1px solid var(--c-border);
    border-radius: 10px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .title {
    font-weight: 600;
  }
  .sub {
    font-size: 13px;
    color: var(--c-muted);
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .badge {
    background: #eef2ff;
    color: #1f6feb;
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 12px;
    font-weight: 600;
  }
  .span-badge {
    display: inline-block;
    margin-left: 6px;
    background: #fff7ed;
    color: #c2410c;
    border: 1px solid #fdba74;
    border-radius: 999px;
    padding: 0 8px;
    font-size: 11px;
    font-weight: 600;
    vertical-align: middle;
  }
  .version {
    text-align: center;
    color: var(--c-muted);
    font-size: 11px;
    margin: 24px 0 8px 0;
    font-family: ui-monospace, "Courier New", monospace;
  }
  .del {
    background: transparent;
    border: 1px solid var(--c-border);
    border-radius: 10px;
    padding: 0 14px;
    font-size: 18px;
  }
</style>
