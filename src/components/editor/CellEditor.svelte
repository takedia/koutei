<script>
  import { loadSettings, saveSettings } from '../../lib/db.js';
  import { onMount } from 'svelte';

  /** @type {{
   *   open: boolean,
   *   title: string,
   *   value: string,
   *   区分: '自社'|'リース'|'外注',
   *   区分種別: '人員'|'重機等'|null,
   *   presetKey: '重機プリセット'|'車両プリセット'|'回送プリセット'|null,
   *   numericOnly?: boolean,
   *   onSave: (v: string, kbn: '自社'|'リース'|'外注') => void,
   *   onCancel: () => void
   * }} */
  let { open, title, value, 区分, 区分種別, presetKey, numericOnly, onSave, onCancel } = $props();

  let local = $state('');
  let localKbn = $state(/** @type {'自社'|'リース'|'外注'} */ ('自社'));
  let presets = $state(/** @type {string[]} */ ([]));
  /** @type {import('../../lib/types.js').設定 | null} */
  let settings = $state(null);
  let mounted = $state(false);

  // 開いた瞬間に初期値をリセット（前回値が残らないように）
  $effect(() => {
    if (open) {
      local = value ?? '';
      localKbn = 区分 ?? '自社';
    }
  });

  // プリセット読み込み（presetKey が変わったら更新）
  $effect(() => {
    if (mounted && settings && presetKey) {
      presets = settings[presetKey] ?? [];
    } else if (mounted) {
      presets = [];
    }
  });

  onMount(async () => {
    settings = await loadSettings();
    mounted = true;
  });

  /** @param {string} v */
  function pick(v) {
    local = v;
  }

  async function addPreset() {
    const v = local.trim();
    if (!v || !presetKey || !settings) {
      save();
      return;
    }
    if (presets.includes(v)) {
      save();
      return;
    }
    if (!confirm(`「${v}」をプリセットに追加します。よろしいですか？`)) {
      save();
      return;
    }
    settings[presetKey] = [...presets, v];
    await saveSettings(settings);
    presets = settings[presetKey];
    save();
  }

  function save() {
    onSave(local.trim(), localKbn);
  }

  function clear() {
    local = '';
  }

  // 区分の選択肢を種別から決定
  let kbnOptions = $derived(
    区分種別 === '人員' ? /** @type {const} */ (['自社', '外注']) :
    区分種別 === '重機等' ? /** @type {const} */ (['自社', 'リース']) :
    /** @type {const} */ ([])
  );

  function kbnColor(/** @type {string} */ k) {
    if (k === 'リース') return '#1f6feb';
    if (k === '外注') return '#dc2626';
    return '#1a1a1a';
  }
</script>

{#if open}
  <div class="backdrop" role="dialog" aria-modal="true">
    <button class="bg" onclick={onCancel} aria-label="閉じる"></button>
    <div class="sheet">
      <header>
        <h2>{title}</h2>
        <button class="x" onclick={onCancel} aria-label="閉じる">×</button>
      </header>

      <div class="body">
        {#if numericOnly}
          <div class="num-display">{local || '0'}</div>
          <div class="num-grid">
            {#each Array.from({length: 21}, (_, i) => i) as n (n)}
              <button class:on={local === String(n)} onclick={() => local = String(n)}>{n}</button>
            {/each}
          </div>
        {:else}
          <!-- svelte-ignore a11y_autofocus -->
          <input type="text" bind:value={local} autofocus style="color: {kbnColor(localKbn)}; font-weight: 600;" />

          {#if kbnOptions.length}
            <div class="kbn">
              <span class="caption">区分</span>
              <div class="seg">
                {#each kbnOptions as k (k)}
                  <button class:on={localKbn === k} onclick={() => localKbn = k} style="--kc: {kbnColor(k)};">{k}</button>
                {/each}
              </div>
            </div>
          {/if}

          {#if presets.length}
            <div class="presets">
              <p class="caption">プリセット（タップで入力）</p>
              <div class="grid">
                {#each presets as p (p)}
                  <button onclick={() => pick(p)}>{p}</button>
                {/each}
              </div>
            </div>
          {/if}
        {/if}
      </div>

      <footer>
        <button class="ghost" onclick={clear}>クリア</button>
        {#if !numericOnly && presetKey && local.trim() && !presets.includes(local.trim())}
          <button class="primary" onclick={addPreset}>＋辞書に追加して入力</button>
        {:else}
          <button class="primary save" onclick={save}>入力</button>
        {/if}
      </footer>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }
  .bg {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.4);
    border: none;
  }
  .sheet {
    position: relative;
    background: #fff;
    border-top-left-radius: 16px;
    border-top-right-radius: 16px;
    max-height: 80dvh;
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
  .x { border: none; background: transparent; font-size: 24px; padding: 0 8px; }
  .body { padding: 14px; display: flex; flex-direction: column; gap: 14px; overflow: auto; }
  .caption { margin: 0; font-size: 12px; color: var(--c-muted); }
  .kbn { display: flex; gap: 10px; align-items: center; }
  .seg { display: flex; gap: 4px; flex: 1; }
  .seg button {
    flex: 1;
    padding: 0 10px;
    min-height: 40px;
    background: #f9fafb;
    border: 1px solid var(--c-border);
  }
  .seg button.on {
    background: var(--kc);
    color: #fff;
    border-color: var(--kc);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 6px;
    margin-top: 6px;
  }
  .grid button {
    text-align: left;
    padding: 8px 10px;
    background: #f9fafb;
    font-size: 13px;
    min-height: 38px;
  }
  .num-display {
    text-align: center;
    font-size: 32px;
    font-weight: 700;
    color: var(--c-accent);
    background: #f3f4f6;
    border-radius: 8px;
    padding: 12px 0;
  }
  .num-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
  }
  .num-grid button {
    padding: 0;
    min-height: 44px;
    font-size: 16px;
    font-weight: 600;
    background: #f9fafb;
  }
  .num-grid button.on {
    background: var(--c-accent);
    color: #fff;
    border-color: var(--c-accent);
  }
  footer {
    display: flex;
    gap: 8px;
    padding: 10px 14px;
    border-top: 1px solid var(--c-border);
  }
  .ghost {
    background: transparent;
  }
  footer .save, footer .primary { flex: 1; }
</style>
