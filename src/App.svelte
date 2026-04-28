<script>
  import Home from './components/Home.svelte';
  import Editor from './components/Editor.svelte';
  import SettingsStub from './components/SettingsStub.svelte';
  import Toaster from './components/Toaster.svelte';
  import Lock from './components/Lock.svelte';
  import { screen } from './lib/stores.js';
  import { authed } from './lib/auth.js';
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
