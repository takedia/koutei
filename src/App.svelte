<script>
  import { onMount } from 'svelte';
  import Home from './components/Home.svelte';
  import Editor from './components/Editor.svelte';
  import SettingsStub from './components/SettingsStub.svelte';
  import Toaster from './components/Toaster.svelte';
  import Lock from './components/Lock.svelte';
  import { screen } from './lib/stores.js';
  import { authed, bootstrapAuth } from './lib/auth.js';

  // 起動時の認証状態決定が完了したかどうか
  let bootstrapped = $state(false);
  // ログインパスワードが必要か（auth.json の passwordHash が空かどうかで決まる）
  let loginRequired = $state(true);

  onMount(async () => {
    try {
      const r = await bootstrapAuth();
      // 取得成功時のみ required を反映。失敗時は安全側で true（ログイン要求）。
      if (r.info) loginRequired = r.required;
    } catch (e) {
      console.error('bootstrap failed', e);
    } finally {
      bootstrapped = true;
    }
  });
</script>

{#if !bootstrapped}
  <p class="boot">起動中…</p>
{:else if loginRequired && !$authed}
  <Lock />
{:else if $screen === 'home'}
  <Home />
{:else if $screen === 'editor'}
  <Editor />
{:else if $screen === 'settings'}
  <SettingsStub />
{/if}

<Toaster />

<style>
  .boot {
    text-align: center;
    padding: 80px 20px;
    color: var(--c-muted);
  }
</style>
