<script>
  import { onMount } from 'svelte';
  import Home from './components/Home.svelte';
  import Editor from './components/Editor.svelte';
  import SettingsStub from './components/SettingsStub.svelte';
  import Toaster from './components/Toaster.svelte';
  import Lock from './components/Lock.svelte';
  import { screen } from './lib/stores.js';
  import { authed, bootstrapAuth } from './lib/auth.js';

  // 起動時に auth.json を読みに行き、パスワード不要モードなら自動解錠
  onMount(() => { bootstrapAuth(); });
</script>

{#if !$authed}
  <Lock />
{:else if $screen === 'home'}
  <Home />
{:else if $screen === 'editor'}
  <Editor />
{:else if $screen === 'settings'}
  <SettingsStub />
{/if}

<Toaster />
