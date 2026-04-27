<script>
  import { KOUSHU_CATEGORIES } from '../../lib/data/koushu.js';
  import { loadSettings, saveSettings } from '../../lib/db.js';
  import { onMount } from 'svelte';

  /** @type {{
   *   open: boolean,
   *   onSelect: (label: string|null, opts?: {休工?: boolean}) => void,
   *   onCancel: () => void
   * }} */
  let { open, onSelect, onCancel } = $props();

  let custom = $state(/** @type {string[]} */ ([]));
  let query = $state('');
  /** @type {import('../../lib/types.js').設定 | null} */
  let settings = $state(null);

  onMount(async () => {
    settings = await loadSettings();
    custom = settings.工種辞書.filter(k => !flatDefault().includes(k));
  });

  function flatDefault() {
    return KOUSHU_CATEGORIES.flatMap(c => c.items);
  }

  /** @param {string} label */
  function pick(label) {
    onSelect(label);
  }

  function pickKyuko() {
    onSelect('休工', { 休工: true });
  }

  async function addCustom() {
    const v = query.trim();
    if (!v) return;
    if (settings?.工種辞書.includes(v)) {
      pick(v);
      return;
    }
    if (!confirm(`「${v}」を工種辞書に追加します。よろしいですか？`)) return;
    if (settings) {
      settings.工種辞書 = [...settings.工種辞書, v];
      await saveSettings(settings);
      custom = [...custom, v];
    }
    pick(v);
  }

  /** @param {string} q */
  function filter(q, items) {
    if (!q) return items;
    return items.filter(i => i.includes(q));
  }
</script>

{#if open}
  <div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="kp-title">
    <button class="bg" onclick={onCancel} aria-label="閉じる"></button>
    <div class="sheet">
      <header>
        <h2 id="kp-title">工種を選ぶ</h2>
        <button class="x" onclick={onCancel} aria-label="閉じる">×</button>
      </header>

      <div class="list">
        <button class="kyuko" onclick={pickKyuko}>
          <span class="kyuko-mark">休</span>
          <span>休工（雨天・休日）</span>
        </button>

        {#each KOUSHU_CATEGORIES as cat (cat.name)}
          {@const items = filter(query, cat.items)}
          {#if items.length}
            <h3>{cat.name}</h3>
            <div class="grid">
              {#each items as it (it)}
                <button onclick={() => pick(it)}>{it}</button>
              {/each}
            </div>
          {/if}
        {/each}

        {#if custom.length}
          {@const items = filter(query, custom)}
          {#if items.length}
            <h3>カスタム</h3>
            <div class="grid">
              {#each items as it (it)}
                <button onclick={() => pick(it)}>{it}</button>
              {/each}
            </div>
          {/if}
        {/if}

        <div class="search">
          <h3>検索 / 新規追加</h3>
          <div class="search-row">
            <!-- svelte-ignore a11y_autofocus -->
            <input
              type="search"
              placeholder="工種名を入力"
              bind:value={query}
            />
            {#if query.trim() && !flatDefault().includes(query.trim()) && !custom.includes(query.trim())}
              <button class="primary add" onclick={addCustom}>＋追加して使う</button>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }
  .bg {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.4);
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
  }
  .sheet {
    position: relative;
    background: #fff;
    border-top-left-radius: 16px;
    border-top-right-radius: 16px;
    max-height: 85dvh;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.18s ease-out;
  }
  @keyframes slideUp {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--c-border);
  }
  header h2 { margin: 0; font-size: 16px; }
  .x { border: none; background: transparent; font-size: 24px; line-height: 1; padding: 0 8px; }

  .list {
    overflow: auto;
    padding: 12px 14px 24px;
  }
  .kyuko {
    width: 100%;
    background: #fef2f2;
    border: 1px solid #fca5a5;
    color: #991b1b;
    padding: 12px 14px;
    border-radius: 8px;
    display: flex;
    gap: 10px;
    align-items: center;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .kyuko-mark {
    background: #b91c1c;
    color: #fff;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
  }
  h3 {
    font-size: 12px;
    color: var(--c-muted);
    margin: 14px 0 6px;
    font-weight: 600;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 6px;
  }
  .grid button {
    text-align: left;
    padding: 10px 12px;
    background: #f9fafb;
  }
  .search {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px dashed var(--c-border);
  }
  .search-row {
    display: flex;
    gap: 8px;
  }
  .search-row input {
    flex: 1;
  }
  .add {
    white-space: nowrap;
  }
</style>
